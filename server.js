'use strict';

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const fsp        = require('fs').promises;
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ── Constants ─────────────────────────────────────────────────────────────────

const PORT         = process.env.PORT || 3001;
const TEMP_DIR     = path.join(__dirname, 'temp');
const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

const VALID_AUDIO_QUALITIES = new Set(['128', '192', '320']);
const VALID_RESOLUTIONS     = new Set(['360', '480', '720', '1080', '1440', '2160', 'best']);
const STANDARD_HEIGHTS      = [360, 480, 720, 1080, 1440, 2160];
const YT_EXTRACTOR_ARGS     = ['--extractor-args', 'youtube:player_client=android_creator'];
const UUID_RE               = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const YT_HOST_RE            = /youtube\.com|youtu\.be/;

const SESSION_COOKIE  = 'mp3ify_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
// Falls back to a random secret generated at boot if unset — sessions just won't
// survive a restart/redeploy. Set SESSION_SECRET in production to avoid that.
const SESSION_SECRET  = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
// Paths reachable without a session — the login page itself, its assets, and the login API.
const PUBLIC_PATHS    = new Set(['/login.html', '/login.js', '/style.css', '/favicon.ico', '/api/login', '/api/auth/status']);

// On Windows, winget-installed binaries may not be in the system PATH yet.
// Scan the known winget package directories at startup and inject any that exist.
// We scan versioned subdirs (e.g. ffmpeg-8.1.1-full_build) so this survives updates.
const SPAWN_ENV = process.platform === 'win32' ? (() => {
  const wingetBase = path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft', 'WinGet', 'Packages',
  );

  // Returns the `bin/` path inside a versioned subdirectory of a winget package dir.
  // winget nests the actual files under a version folder (e.g. <pkg>/ffmpeg-8.x-…/bin).
  function wingetBinDir(pkgDir) {
    try {
      const subs = fs.readdirSync(pkgDir);
      for (const sub of subs) {
        const candidate = path.join(pkgDir, sub, 'bin');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* package not installed */ }
    return null;
  }

  const extra = [
    // yt-dlp (the exe sits directly in the package dir, no bin/ subfolder)
    path.join(wingetBase, 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe'),
    // ffmpeg — Gyan.FFmpeg winget source
    wingetBinDir(path.join(wingetBase, 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe')),
    // ffmpeg — yt-dlp.FFmpeg winget source (alternate publisher)
    wingetBinDir(path.join(wingetBase, 'yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe')),
  ].filter(Boolean);

  return { ...process.env, PATH: [process.env.PATH, ...extra].join(';') };
})() : process.env;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

fs.mkdirSync(TEMP_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const { protocol } = new URL(url.trim());
    return protocol === 'http:' || protocol === 'https:';
  } catch { return false; }
}

function isYouTubeUrl(url) {
  return YT_HOST_RE.test(url);
}

function sanitizeFilename(name) {
  return (name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'download';
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function cookieArgs() {
  return fs.existsSync(COOKIES_FILE) ? ['--cookies', COOKIES_FILE] : [];
}

// ── Session auth (signed cookie, no server-side store) ────────────────────────

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // keep timing constant even on length mismatch
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function signSession(expiry) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(expiry)).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function hasValidSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return false;
  const [expiryStr, sig] = token.split('.');
  const expiry = Number(expiryStr);
  if (!expiry || !sig || Date.now() > expiry) return false;
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(signSession(expiry), 'hex');
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

function setSessionCookie(req, res) {
  const expiry  = Date.now() + SESSION_MAX_AGE;
  const token   = `${expiry}.${signSession(expiry)}`;
  const secure  = req.secure ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MAX_AGE / 1000)}${secure}`,
  );
}

function clearSessionCookie(req, res) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

// ── yt-dlp argument builders ──────────────────────────────────────────────────

function buildInfoArgs(url) {
  return [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    ...(isYouTubeUrl(url) ? YT_EXTRACTOR_ARGS : []),
    ...cookieArgs(),
    url,
  ];
}

function buildVideoFormat(resolution) {
  // Prefer H.264 (avc1) so the output plays in QuickTime on Mac.
  // VP9/AV1 is YouTube's default for 1080p+ but QuickTime doesn't support it.
  // We fall back to whatever codec is available if H.264 isn't offered at that resolution.
  if (resolution === 'best') {
    return [
      'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]',
      'bestvideo[vcodec^=avc1]+bestaudio',
      'bestvideo+bestaudio[ext=m4a]',
      'bestvideo+bestaudio',
      'best',
    ].join('/');
  }
  const h = resolution;
  return [
    `bestvideo[height<=${h}][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]`,
    `bestvideo[height<=${h}][vcodec^=avc1]+bestaudio[ext=m4a]`,
    `bestvideo[height<=${h}][vcodec^=avc1]+bestaudio`,
    `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]`,
    `bestvideo[height<=${h}]+bestaudio[ext=m4a]`,
    `bestvideo[height<=${h}]+bestaudio`,
    `best[height<=${h}]`,
    'best',
  ].join('/');
}

function buildDownloadArgs(url, { mediaType, quality, resolution, outputTemplate }) {
  const base = [
    '--no-playlist',
    '--no-warnings',
    ...(isYouTubeUrl(url) ? YT_EXTRACTOR_ARGS : []),
    '--newline',
    '-o', outputTemplate,
    ...cookieArgs(),
  ];
  const media = mediaType === 'audio'
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', `${quality}K`]
    : ['-f', buildVideoFormat(resolution), '--merge-output-format', 'mp4', '--remux-video', 'mp4'];
  return [...base, ...media, url];
}

// ── Video info parser ─────────────────────────────────────────────────────────

function parseVideoInfo(info) {
  const videoHeights = new Set(
    (info.formats || [])
      .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
      .map(f => f.height),
  );
  const availableResolutions = STANDARD_HEIGHTS.filter(r =>
    [...videoHeights].some(h => Math.abs(h - r) <= 10),
  );
  const uploadDate = info.upload_date
    ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
    : null;

  return {
    title:                info.title    || 'Unknown Title',
    thumbnail:            info.thumbnail || '',
    duration:             formatDuration(info.duration),
    channel:              info.uploader || info.channel || 'Unknown Channel',
    viewCount:            info.view_count ? info.view_count.toLocaleString() : null,
    uploadDate,
    availableResolutions: availableResolutions.length > 0 ? availableResolutions : [360, 480, 720, 1080],
  };
}

// ── Progress line parser (closure tracks video/audio phase) ───────────────────

function createProgressParser(mediaType) {
  let videoStreamDone = false;

  return function parseLine(line) {
    if (!line.trim()) return null;

    if (mediaType === 'video') {
      if (line.includes('Downloading video')) { videoStreamDone = false; return null; }
      if (line.includes('Downloading audio')) { videoStreamDone = true;  return null; }
    }

    const dlMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (dlMatch) {
      const raw      = parseFloat(dlMatch[1]);
      const eta      = (line.match(/ETA\s+([\d:]+)/) || [])[1] || null;
      const progress = mediaType === 'video'
        ? (videoStreamDone ? 50 + raw / 2 : raw / 2)
        : raw;
      const subLabel = mediaType === 'video'
        ? (videoStreamDone ? 'Downloading audio stream…' : 'Downloading video stream…')
        : 'Downloading…';
      return { type: 'progress', phase: 'download', progress, eta, subLabel };
    }

    if (line.includes('[Merger]')) {
      return { type: 'progress', phase: 'merge', progress: 100, subLabel: 'Merging video + audio…' };
    }
    if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
      return { type: 'progress', phase: 'convert', progress: 100, subLabel: 'Converting…' };
    }
    return null;
  };
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function sse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Temp file cleanup ─────────────────────────────────────────────────────────

async function cleanTempDir() {
  const maxAge = 60 * 60 * 1000; // 1 hour
  try {
    const files = await fsp.readdir(TEMP_DIR);
    await Promise.all(files.map(async file => {
      const fp = path.join(TEMP_DIR, file);
      try {
        const { mtimeMs } = await fsp.stat(fp);
        if (Date.now() - mtimeMs > maxAge) await fsp.unlink(fp);
      } catch { /* already gone */ }
    }));
  } catch { /* dir missing */ }
}

setInterval(cleanTempDir, 60 * 60 * 1000);

// ── Express setup ─────────────────────────────────────────────────────────────

const app = express();

app.set('trust proxy', 1); // needed for req.secure behind a reverse proxy (Render, Fly, etc.)
app.use(express.json({ limit: '10kb' }));

const AUTH_ENABLED = Boolean(process.env.AUTH_USER && process.env.AUTH_PASS);

if (AUTH_ENABLED) {
  app.use((req, res, next) => {
    if (PUBLIC_PATHS.has(req.path) || hasValidSession(req)) return next();
    if (req.method === 'GET' && req.accepts(['html', 'json']) === 'html') {
      const next = encodeURIComponent(req.originalUrl);
      return res.redirect(`/login.html?next=${next}`);
    }
    res.status(401).json({ error: 'Unauthorized' });
  });
  console.log('  Login required (session auth enabled)');
}

app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — please wait and try again.' },
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (!AUTH_ENABLED) return res.status(404).json({ error: 'Login is not enabled.' });
  const { username, password } = req.body || {};
  const validUser = timingSafeEqualStr(username, process.env.AUTH_USER);
  const validPass = timingSafeEqualStr(password, process.env.AUTH_PASS);
  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  setSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/status', (_req, res) => {
  res.json({ enabled: AUTH_ENABLED });
});

const limiter = (max, windowMs) => rateLimit({
  windowMs, max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait and try again.' },
});

// ── Cookie routes ─────────────────────────────────────────────────────────────

app.get('/api/cookies/status', (_req, res) => {
  res.json({ active: fs.existsSync(COOKIES_FILE) });
});

app.post('/api/cookies', express.text({ limit: '2mb', type: 'text/plain' }), (req, res) => {
  const content = req.body;
  if (typeof content !== 'string' || content.trim().length < 10) {
    return res.status(400).json({ error: 'Invalid cookies file.' });
  }
  try {
    fs.writeFileSync(COOKIES_FILE, content, 'utf8');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to save cookies.' });
  }
});

app.delete('/api/cookies', (_req, res) => {
  try {
    if (fs.existsSync(COOKIES_FILE)) fs.unlinkSync(COOKIES_FILE);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove cookies.' });
  }
});

// ── POST /api/info ────────────────────────────────────────────────────────────

app.post('/api/info', limiter(20, 15 * 60 * 1000), (req, res) => {
  const url = (req.body.url || '').trim();

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }

  const proc = spawn('yt-dlp', buildInfoArgs(url), { env: SPAWN_ENV });
  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', chunk => { stdout += chunk; });
  proc.stderr.on('data', chunk => { stderr += chunk; });

  proc.on('error', err => {
    if (res.headersSent) return;
    const msg = err.code === 'ENOENT'
      ? 'yt-dlp is not installed. See README for setup instructions.'
      : 'Failed to start yt-dlp.';
    res.status(500).json({ error: msg });
  });

  proc.on('close', code => {
    if (res.headersSent) return;
    if (code !== 0) {
      console.error('[/api/info] exit', code, stderr.slice(0, 400));
      const msg = stderr.includes('Video unavailable') ? 'This video is unavailable.'
        : stderr.includes('Private video')             ? 'This video is private.'
        : 'Could not fetch info — check the URL and try again.';
      return res.status(400).json({ error: msg });
    }
    try {
      res.json(parseVideoInfo(JSON.parse(stdout)));
    } catch (e) {
      console.error('[/api/info] parse error:', e.message);
      res.status(500).json({ error: 'Failed to parse video information.' });
    }
  });
});

// ── POST /api/download ────────────────────────────────────────────────────────

app.post('/api/download', limiter(10, 60 * 60 * 1000), (req, res) => {
  const url        = (req.body.url        || '').trim();
  const mediaType  = req.body.mediaType === 'video' ? 'video' : 'audio';
  const quality    = req.body.quality    || '192';
  const resolution = req.body.resolution || 'best';
  const titleHint  = sanitizeFilename(req.body.title);

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL.' });
  }
  if (mediaType === 'audio' && !VALID_AUDIO_QUALITIES.has(quality)) {
    return res.status(400).json({ error: `Audio quality must be one of: ${[...VALID_AUDIO_QUALITIES].join(', ')}.` });
  }
  if (mediaType === 'video' && !VALID_RESOLUTIONS.has(resolution)) {
    return res.status(400).json({ error: `Resolution must be one of: ${[...VALID_RESOLUTIONS].join(', ')}.` });
  }

  const ext            = mediaType === 'video' ? 'mp4' : 'mp3';
  const fileId         = uuidv4();
  const outputTemplate = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

  initSSE(res);
  sse(res, { type: 'start' });

  const args    = buildDownloadArgs(url, { mediaType, quality, resolution, outputTemplate });
  const proc    = spawn('yt-dlp', args, { env: SPAWN_ENV });
  const parseLine = createProgressParser(mediaType);
  let killed    = false;

  proc.stdout.on('data', chunk => {
    for (const line of chunk.toString().split('\n')) {
      const event = parseLine(line);
      if (event) sse(res, event);
    }
  });

  proc.stderr.on('data', chunk => {
    console.error('[yt-dlp]', chunk.toString().trimEnd());
  });

  proc.on('error', err => {
    if (killed) return;
    const msg = err.code === 'ENOENT'
      ? 'yt-dlp is not installed. See README for setup instructions.'
      : 'Failed to start download process.';
    sse(res, { type: 'error', message: msg });
    res.end();
  });

  proc.on('close', code => {
    if (killed) return;
    if (code !== 0) {
      sse(res, { type: 'error', message: 'Download failed. The media may be unavailable or geo-restricted.' });
      res.end();
      return;
    }

    const allFiles = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
    const outFile  = allFiles.find(f => f.endsWith(`.${ext}`)) || allFiles[0];
    const actualExt = outFile ? path.extname(outFile).slice(1) : ext;
    if (!outFile) {
      sse(res, { type: 'error', message: `Processing failed — ${ext.toUpperCase()} output not found.` });
      res.end();
      return;
    }

    sse(res, { type: 'done', fileId, ext: actualExt, filename: `${titleHint}.${actualExt}` });
    res.end();
  });

  req.on('close', () => {
    if (proc.killed) return;
    killed = true;
    proc.kill('SIGTERM');
    fsp.readdir(TEMP_DIR)
      .then(files => Promise.all(
        files.filter(f => f.startsWith(fileId)).map(f => fsp.unlink(path.join(TEMP_DIR, f)).catch(() => {})),
      ))
      .catch(() => {});
  });
});

// ── GET /api/file/:fileId ─────────────────────────────────────────────────────

const CONTENT_TYPES = { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mp3: 'audio/mpeg', m4a: 'audio/mp4' };
const VALID_FILE_EXTS = new Set(Object.keys(CONTENT_TYPES));

app.get('/api/file/:fileId', (req, res) => {
  const { fileId } = req.params;
  const reqExt     = req.query.ext;
  const ext        = VALID_FILE_EXTS.has(reqExt) ? reqExt : 'mp4';
  const rawName    = req.query.name ? sanitizeFilename(req.query.name) : 'download';

  if (!UUID_RE.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID.' });
  }

  const filePath = path.join(TEMP_DIR, `${fileId}.${ext}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or already downloaded.' });
  }

  // HTTP headers must be ASCII; RFC 5987 encodes the full name for modern browsers
  const asciiFallback = rawName.replace(/[^\x20-\x7e]/g, '').trim() || 'download';
  const encodedName   = encodeURIComponent(`${rawName}.${ext}`);
  const contentType   = CONTENT_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}.${ext}"; filename*=UTF-8''${encodedName}`,
  );

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('close', () => fsp.unlink(filePath).catch(() => {}));
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  MP3ify — Media Downloader`);
  console.log(`  http://localhost:${PORT}\n`);
});
