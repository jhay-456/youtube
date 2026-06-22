'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;
const TEMP_DIR = path.join(__dirname, 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ── Middleware ──────────────────────────────────────────────────────────────

app.use(express.json({ limit: '1kb' }));

// Password protection — set AUTH_USER and AUTH_PASS env vars to enable
if (process.env.AUTH_USER && process.env.AUTH_PASS) {
  const basicAuth = require('express-basic-auth');
  app.use(basicAuth({
    users: { [process.env.AUTH_USER]: process.env.AUTH_PASS },
    challenge: true,
    realm: 'MP3ify',
  }));
  console.log('  Basic auth enabled');
}

app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a few minutes and try again.' },
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Download limit reached for this hour. Please try again later.' },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/;

function isValidYouTubeUrl(url) {
  return typeof url === 'string' && YT_URL_RE.test(url.trim());
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'audio';
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Periodic temp-file cleanup (files older than 1 hour) ─────────────────────

setInterval(() => {
  const maxAge = 60 * 60 * 1000;
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    for (const file of files) {
      const fp = path.join(TEMP_DIR, file);
      fs.stat(fp, (e, stat) => {
        if (!e && Date.now() - stat.mtimeMs > maxAge) fs.unlink(fp, () => {});
      });
    }
  });
}, 60 * 60 * 1000);

// ── Routes ───────────────────────────────────────────────────────────────────

// POST /api/info — fetch video metadata
app.post('/api/info', apiLimiter, (req, res) => {
  const url = (req.body.url || '').trim();

  if (!isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL.' });
  }

  const proc = spawn('yt-dlp', [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=android,ios',
    url,
  ]);

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', chunk => { stdout += chunk; });
  proc.stderr.on('data', chunk => { stderr += chunk; });

  proc.on('close', code => {
    if (code !== 0) {
      const msg = stderr.includes('Video unavailable')
        ? 'This video is unavailable.'
        : stderr.includes('Private video')
        ? 'This video is private.'
        : 'Could not fetch video info. Check the URL and try again.';
      return res.status(400).json({ error: msg });
    }

    try {
      const info = JSON.parse(stdout);

      // Derive available video resolutions from the format list
      const STANDARD_HEIGHTS = [360, 480, 720, 1080, 1440, 2160];
      const videoHeights = new Set(
        (info.formats || [])
          .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
          .map(f => f.height)
      );
      const availableResolutions = STANDARD_HEIGHTS.filter(r =>
        [...videoHeights].some(h => Math.abs(h - r) <= 10)
      );

      res.json({
        title: info.title || 'Unknown Title',
        thumbnail: info.thumbnail || '',
        duration: formatDuration(info.duration),
        durationRaw: info.duration || 0,
        channel: info.uploader || info.channel || 'Unknown Channel',
        viewCount: info.view_count ? info.view_count.toLocaleString() : null,
        uploadDate: info.upload_date
          ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
          : null,
        filesize: info.filesize_approx || null,
        availableResolutions: availableResolutions.length > 0
          ? availableResolutions
          : [360, 480, 720, 1080], // fallback if formats not exposed
      });
    } catch {
      res.status(500).json({ error: 'Failed to parse video information.' });
    }
  });

  proc.on('error', err => {
    if (err.code === 'ENOENT') {
      res.status(500).json({ error: 'yt-dlp is not installed. See README for setup instructions.' });
    } else {
      res.status(500).json({ error: 'Internal server error.' });
    }
  });
});

// POST /api/download — download + convert, stream progress via SSE
app.post('/api/download', downloadLimiter, (req, res) => {
  const url        = (req.body.url || '').trim();
  const mediaType  = req.body.mediaType === 'video' ? 'video' : 'audio';
  const quality    = req.body.quality    || '192';
  const resolution = req.body.resolution || '720';
  const titleHint  = sanitizeFilename(req.body.title || 'audio');

  if (!isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL.' });
  }

  if (mediaType === 'audio' && !new Set(['128', '192', '320']).has(quality)) {
    return res.status(400).json({ error: 'Quality must be 128, 192, or 320.' });
  }
  if (mediaType === 'video' && !new Set(['360', '480', '720', '1080', '1440', '2160', 'best']).has(resolution)) {
    return res.status(400).json({ error: 'Resolution must be 360, 480, 720, 1080, 1440, 2160, or best.' });
  }

  const ext = mediaType === 'video' ? 'mp4' : 'mp3';
  const fileId         = uuidv4();
  const outputTemplate = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sendSSE(res, { type: 'start', message: 'Starting download…' });

  const baseArgs = [
    '--no-playlist',
    '--no-warnings',
    '--extractor-args', 'youtube:player_client=android,ios',
    '--newline',
    '-o', outputTemplate,
  ];

  // Build yt-dlp format string for video.
  // Prefer MP4 video + M4A audio so ffmpeg can stream-copy without re-encoding (faster, lossless).
  // "best" = no height cap — yt-dlp picks the highest quality the video offers (up to 4K/8K).
  const videoFormat = resolution === 'best'
    ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
    : `bestvideo[height<=${resolution}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${resolution}]+bestaudio[ext=m4a]/bestvideo[height<=${resolution}]+bestaudio/best[height<=${resolution}]`;

  const mediaArgs = mediaType === 'audio'
    ? ['-x', '--audio-format', 'mp3', '--audio-quality', `${quality}K`]
    : ['-f', videoFormat, '--merge-output-format', 'mp4'];

  const proc = spawn('yt-dlp', [...baseArgs, ...mediaArgs, url]);
  let killed = false;

  // For video, yt-dlp downloads video stream then audio stream separately before merging.
  // Track which stream is active so we can split progress across two 50% halves.
  let videoStreamDone = false;

  proc.stdout.on('data', chunk => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      if (mediaType === 'video') {
        if (line.includes('Downloading video')) { videoStreamDone = false; continue; }
        if (line.includes('Downloading audio')) { videoStreamDone = true;  continue; }
      }

      const dlMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
      if (dlMatch) {
        const raw = parseFloat(dlMatch[1]);
        const eta = (line.match(/ETA\s+([\d:]+)/) || [])[1] || null;

        // Video has two download streams; map each to a 0-50 / 50-100 window
        const progress = mediaType === 'video'
          ? (videoStreamDone ? 50 + raw / 2 : raw / 2)
          : raw;

        const subLabel = mediaType === 'video'
          ? (videoStreamDone ? 'Downloading audio stream…' : 'Downloading video stream…')
          : 'Downloading…';

        sendSSE(res, { type: 'progress', phase: 'download', progress, eta, subLabel });
        continue;
      }

      if (line.includes('[Merger]')) {
        sendSSE(res, { type: 'progress', phase: 'merge', progress: 100, subLabel: 'Merging video + audio…' });
        continue;
      }

      if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
        sendSSE(res, { type: 'progress', phase: 'convert', progress: 100, subLabel: 'Converting to MP3…' });
        continue;
      }
    }
  });

  proc.stderr.on('data', chunk => {
    console.error('[yt-dlp stderr]', chunk.toString().trimEnd());
  });

  proc.on('error', err => {
    if (!killed) {
      const msg = err.code === 'ENOENT'
        ? 'yt-dlp is not installed. See README for setup instructions.'
        : 'Failed to start download process.';
      sendSSE(res, { type: 'error', message: msg });
      res.end();
    }
  });

  proc.on('close', code => {
    if (killed) return;

    if (code !== 0) {
      sendSSE(res, { type: 'error', message: 'Download failed. The video may be unavailable or geo-restricted.' });
      res.end();
      return;
    }

    const outFiles = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId) && f.endsWith(`.${ext}`));
    if (outFiles.length === 0) {
      sendSSE(res, { type: 'error', message: `Processing failed — ${ext.toUpperCase()} output not found.` });
      res.end();
      return;
    }

    sendSSE(res, { type: 'done', fileId, ext, filename: `${titleHint}.${ext}`, message: 'Ready!' });
    res.end();
  });

  req.on('close', () => {
    if (!proc.killed) {
      killed = true;
      proc.kill('SIGTERM');
      fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        for (const f of files) {
          if (f.startsWith(fileId)) fs.unlink(path.join(TEMP_DIR, f), () => {});
        }
      });
    }
  });
});

// GET /api/file/:fileId — serve the MP3 and clean up
app.get('/api/file/:fileId', (req, res) => {
  const { fileId } = req.params;
  const rawName = req.query.name ? sanitizeFilename(req.query.name) : 'audio';
  const ext     = req.query.ext === 'mp4' ? 'mp4' : 'mp3';

  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID.' });
  }

  const filePath = path.join(TEMP_DIR, `${fileId}.${ext}`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or already downloaded.' });
  }

  // HTTP headers are ASCII-only; use RFC 5987 encoding for non-ASCII filenames (e.g. Thai, Japanese)
  const contentType   = ext === 'mp4' ? 'video/mp4' : 'audio/mpeg';
  const asciiFallback = rawName.replace(/[^\x20-\x7e]/g, '').trim() || 'audio';
  const encodedName   = encodeURIComponent(`${rawName}.${ext}`);
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}.${ext}"; filename*=UTF-8''${encodedName}`
  );

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);

  stream.on('close', () => {
    fs.unlink(filePath, () => {});
  });

  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to stream file.' });
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  YouTube MP3 Downloader`);
  console.log(`  Running at http://localhost:${PORT}\n`);
});
