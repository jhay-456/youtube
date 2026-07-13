'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const RES_META = {
  best: { kbps: 'Best', unit: '',  note: 'Auto-max' },
  360:  { kbps: '360',  unit: 'p', note: 'Small file' },
  480:  { kbps: '480',  unit: 'p', note: 'SD' },
  720:  { kbps: '720',  unit: 'p', note: 'HD' },
  1080: { kbps: '1080', unit: 'p', note: 'Full HD' },
  1440: { kbps: '1440', unit: 'p', note: '2K' },
  2160: { kbps: '4K',   unit: '',  note: 'Ultra HD' },
};

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  title:           '',
  mediaType:       'audio', // 'audio' | 'video'
  abortController: null,
  etaSeconds:      null,
  etaInterval:     null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const el = {
  // URL bar
  urlInput:    document.getElementById('urlInput'),
  clearBtn:    document.getElementById('clearBtn'),
  fetchBtn:    document.getElementById('fetchBtn'),

  // Error
  errorBanner: document.getElementById('errorBanner'),

  // Metadata
  metaSection:  document.getElementById('metaSection'),
  thumbnail:    document.getElementById('thumbnail'),
  videoTitle:   document.getElementById('videoTitle'),
  channelName:  document.getElementById('channelName'),
  durationPill: document.getElementById('durationPill'),
  viewsPill:    document.getElementById('viewsPill'),
  datePill:     document.getElementById('datePill'),

  // Format & quality
  fmtAudio:          document.getElementById('fmtAudio'),
  fmtVideo:          document.getElementById('fmtVideo'),
  audioOptions:      document.getElementById('audioOptions'),
  videoOptions:      document.getElementById('videoOptions'),
  resolutionSelector: document.getElementById('resolutionSelector'),
  downloadBtn:       document.getElementById('downloadBtn'),
  downloadBtnLabel:  document.getElementById('downloadBtnLabel'),

  // Progress
  progressSection: document.getElementById('progressSection'),
  progressBar:     document.getElementById('progressBar'),
  progressTrack:   document.querySelector('.progress-track'),
  progressLabel:   document.getElementById('progressLabel'),
  progressPhase:   document.getElementById('progressPhase'),
  progressPct:     document.getElementById('progressPct'),
  progressEta:     document.getElementById('progressEta'),
  cancelBtn:       document.getElementById('cancelBtn'),

  // Result
  resultSection:  document.getElementById('resultSection'),
  resultHeading:  document.getElementById('resultHeading'),
  resultFilename: document.getElementById('resultFilename'),
  downloadLink:   document.getElementById('downloadLink'),
  resetBtn:       document.getElementById('resetBtn'),

  // Cookies
  cookieFileInput: document.getElementById('cookieFileInput'),
  cookieUploadBtn: document.getElementById('cookieUploadBtn'),
  cookieActiveBar: document.getElementById('cookieActiveBar'),
  cookieRemoveBtn: document.getElementById('cookieRemoveBtn'),

  // Theme
  themeToggle: document.getElementById('themeToggle'),

  // Auth
  logoutBtn: document.getElementById('logoutBtn'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function show(elem)  { elem.hidden = false; }
function hide(elem)  { elem.hidden = true;  }

function showError(msg) {
  el.errorBanner.textContent = msg;
  show(el.errorBanner);
}

function hideError() { hide(el.errorBanner); }

function setLoading(btn, loading) {
  btn.disabled = loading;
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  if (text)    text.hidden    = loading;
  if (spinner) spinner.hidden = !loading;
}

// ── Theme ─────────────────────────────────────────────────────────────────────

document.documentElement.setAttribute(
  'data-theme',
  localStorage.getItem('theme') || 'dark',
);

el.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

async function refreshAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const { enabled } = await res.json();
    el.logoutBtn.hidden = !enabled;
  } catch { /* server may not be ready yet */ }
}

refreshAuthStatus();

el.logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login.html';
});

// ── Cookie management ─────────────────────────────────────────────────────────

async function refreshCookieStatus() {
  try {
    const res     = await fetch('/api/cookies/status');
    const { active } = await res.json();
    el.cookieUploadBtn.hidden = active;
    el.cookieActiveBar.hidden = !active;
  } catch { /* server may not be ready yet */ }
}

refreshCookieStatus();

el.cookieFileInput.addEventListener('change', async () => {
  const file = el.cookieFileInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const res  = await fetch('/api/cookies', {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    text,
    });
    if (res.ok) {
      refreshCookieStatus();
    } else {
      const data = await res.json().catch(() => ({}));
      showError(data.error || 'Failed to upload cookies.');
    }
  } catch {
    showError('Network error uploading cookies.');
  } finally {
    el.cookieFileInput.value = '';
  }
});

el.cookieRemoveBtn.addEventListener('click', async () => {
  await fetch('/api/cookies', { method: 'DELETE' }).catch(() => {});
  refreshCookieStatus();
});

// ── Format / media-type ───────────────────────────────────────────────────────

function setMediaType(type) {
  state.mediaType = type;
  const isAudio   = type === 'audio';
  el.fmtAudio.classList.toggle('active', isAudio);
  el.fmtVideo.classList.toggle('active', !isAudio);
  el.audioOptions.hidden      = !isAudio;
  el.videoOptions.hidden      = isAudio;
  el.downloadBtnLabel.textContent = isAudio ? 'Download MP3' : 'Download MP4';
}

el.fmtAudio.addEventListener('click', () => setMediaType('audio'));
el.fmtVideo.addEventListener('click', () => setMediaType('video'));

// ── URL input ─────────────────────────────────────────────────────────────────

el.urlInput.addEventListener('input', () => {
  el.clearBtn.hidden = el.urlInput.value.length === 0;
  if (!el.errorBanner.hidden) hideError();
});

el.urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') el.fetchBtn.click();
});

el.clearBtn.addEventListener('click', () => {
  el.urlInput.value  = '';
  el.clearBtn.hidden = true;
  el.urlInput.focus();
  hideError();
  hide(el.metaSection);
  hide(el.progressSection);
  hide(el.resultSection);
});

// ── Progress & ETA ────────────────────────────────────────────────────────────

function setProgress(pct, label, phase, eta) {
  el.progressBar.classList.remove('indeterminate');
  el.progressBar.style.width = `${pct}%`;
  el.progressTrack.setAttribute('aria-valuenow', Math.round(pct));
  if (label !== undefined) el.progressLabel.textContent = label;
  if (phase !== undefined) el.progressPhase.textContent = phase;
  el.progressPct.textContent = pct < 100 ? `${Math.round(pct)}%` : '';
  if (eta) updateEta(eta);
}

function setIndeterminate(label) {
  el.progressBar.classList.add('indeterminate');
  el.progressPct.textContent    = '';
  el.progressPhase.textContent  = '';
  if (label !== undefined) el.progressLabel.textContent = label;
}

function renderEta(secs) {
  if (secs === null) { el.progressEta.textContent = ''; return; }
  const h   = Math.floor(secs / 3600);
  const m   = Math.floor((secs % 3600) / 60);
  const s   = secs % 60;
  const str = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
  const text = `ETA ${str}`;
  if (el.progressEta.textContent === text) return;
  el.progressEta.classList.remove('eta-tick');
  void el.progressEta.offsetWidth; // reflow to restart animation
  el.progressEta.classList.add('eta-tick');
  el.progressEta.textContent = text;
}

function updateEta(raw) {
  if (!raw) return;
  const parts = raw.split(':').map(Number);
  if (parts.some(isNaN)) return;
  state.etaSeconds = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  if (!state.etaInterval) {
    state.etaInterval = setInterval(() => {
      if (state.etaSeconds === null) return;
      state.etaSeconds = Math.max(0, state.etaSeconds - 1);
      renderEta(state.etaSeconds);
    }, 1000);
  }
}

function stopEta() {
  clearInterval(state.etaInterval);
  state.etaInterval        = null;
  state.etaSeconds         = null;
  el.progressEta.textContent = '';
}

// ── Resolution options ────────────────────────────────────────────────────────

function renderResolutionOptions(resolutions) {
  el.resolutionSelector.innerHTML = '';
  for (const r of ['best', ...resolutions]) {
    const meta = RES_META[r] || { kbps: String(r), unit: 'p', note: '' };

    const input = document.createElement('input');
    input.type    = 'radio';
    input.name    = 'resolution';
    input.value   = String(r);
    input.checked = r === 'best';

    const kbpsSpan = Object.assign(document.createElement('span'), { className: 'quality-kbps', textContent: meta.kbps });
    const unitSpan = Object.assign(document.createElement('span'), { className: 'quality-unit', textContent: meta.unit });
    const noteSpan = Object.assign(document.createElement('span'), { className: 'quality-note', textContent: meta.note });

    const labelSpan = document.createElement('span');
    labelSpan.className = 'quality-label';
    labelSpan.append(kbpsSpan, unitSpan, noteSpan);

    const label = document.createElement('label');
    label.className = 'quality-opt';
    label.append(input, labelSpan);

    el.resolutionSelector.appendChild(label);
  }
}

// ── SSE stream parser ─────────────────────────────────────────────────────────

async function* streamSSE(response) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        if (line.startsWith('data: ')) {
          try { yield JSON.parse(line.slice(6)); } catch { /* skip malformed */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Fetch video info ──────────────────────────────────────────────────────────

el.fetchBtn.addEventListener('click', async () => {
  const url = el.urlInput.value.trim();
  if (!url) { el.urlInput.focus(); return; }

  hideError();
  hide(el.metaSection);
  hide(el.progressSection);
  hide(el.resultSection);
  setLoading(el.fetchBtn, true);

  try {
    const res  = await fetch('/api/info', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to fetch info.');
      return;
    }

    state.title = data.title;

    el.thumbnail.src         = data.thumbnail || '';
    el.thumbnail.alt         = data.title;
    el.videoTitle.textContent  = data.title;
    el.channelName.textContent = data.channel;
    el.durationPill.textContent = data.duration;

    if (data.viewCount) {
      el.viewsPill.textContent = `${data.viewCount} views`;
      show(el.viewsPill);
    } else {
      hide(el.viewsPill);
    }

    if (data.uploadDate) {
      el.datePill.textContent = new Date(data.uploadDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      show(el.datePill);
    } else {
      hide(el.datePill);
    }

    renderResolutionOptions(data.availableResolutions || [360, 480, 720, 1080]);
    show(el.metaSection);
  } catch {
    showError('Network error — is the server running?');
  } finally {
    setLoading(el.fetchBtn, false);
  }
});

// ── Download ──────────────────────────────────────────────────────────────────

el.downloadBtn.addEventListener('click', async () => {
  const url = el.urlInput.value.trim();
  if (!url) return;

  const quality    = document.querySelector('input[name="quality"]:checked')?.value    ?? '192';
  const resolution = document.querySelector('input[name="resolution"]:checked')?.value ?? 'best';

  hideError();
  hide(el.resultSection);
  show(el.progressSection);
  setLoading(el.downloadBtn, true);
  setIndeterminate('Starting download…');
  stopEta();

  state.abortController = new AbortController();
  el.cancelBtn.disabled = false;

  try {
    const res = await fetch('/api/download', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, mediaType: state.mediaType, quality, resolution, title: state.title }),
      signal:  state.abortController.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || 'Download failed.');
      hide(el.progressSection);
      return;
    }

    for await (const event of streamSSE(res)) {
      switch (event.type) {
        case 'start':
          setIndeterminate('Starting download…');
          break;

        case 'progress':
          if (event.phase === 'download') {
            const phaseNote = state.mediaType === 'video'
              ? 'Downloading streams (video then audio)…'
              : 'Fetching audio…';
            setProgress(event.progress, event.subLabel || 'Downloading…', phaseNote, event.eta);
          } else if (event.phase === 'convert') {
            setIndeterminate(event.subLabel || 'Converting…');
          } else if (event.phase === 'merge') {
            setIndeterminate(event.subLabel || 'Merging video + audio…');
          }
          break;

        case 'done': {
          const ext      = event.ext || 'mp3';
          const filename = event.filename || `${state.title || 'download'}.${ext}`;
          const safeName = filename.replace(/[<>:"/\\|?*]/g, '');
          const baseName = safeName.replace(new RegExp(`\\.${ext}$`), '');

          el.downloadLink.href = `/api/file/${event.fileId}?ext=${ext}&name=${encodeURIComponent(baseName)}`;
          el.downloadLink.setAttribute('download', safeName);
          el.resultFilename.textContent = safeName;
          el.resultHeading.textContent  = ext === 'mp4' ? 'Your video is ready' : 'Your audio is ready';

          hide(el.progressSection);
          show(el.resultSection);
          el.downloadLink.click();
          break;
        }

        case 'error':
          showError(event.message || 'Download failed.');
          hide(el.progressSection);
          break;
      }
    }
  } catch (err) {
    hide(el.progressSection);
    if (err.name !== 'AbortError') {
      showError('Connection lost — please try again.');
    }
  } finally {
    setLoading(el.downloadBtn, false);
    el.cancelBtn.disabled = true;
    state.abortController = null;
    stopEta();
  }
});

// ── Cancel ────────────────────────────────────────────────────────────────────

el.cancelBtn.addEventListener('click', () => {
  if (state.abortController) {
    el.cancelBtn.disabled = true;
    state.abortController.abort();
  }
});

// ── Reset ─────────────────────────────────────────────────────────────────────

el.resetBtn.addEventListener('click', () => {
  el.urlInput.value  = '';
  el.clearBtn.hidden = true;
  state.title        = '';

  setMediaType('audio');
  hide(el.metaSection);
  hide(el.progressSection);
  hide(el.resultSection);
  hideError();

  el.urlInput.focus();
});
