'use strict';

// ── DOM References ────────────────────────────────────────────────────────────

const urlInput      = document.getElementById('urlInput');
const clearBtn      = document.getElementById('clearBtn');
const fetchBtn      = document.getElementById('fetchBtn');
const downloadBtn   = document.getElementById('downloadBtn');
const downloadBtnLabel = document.getElementById('downloadBtnLabel');
const resetBtn      = document.getElementById('resetBtn');
const themeToggle   = document.getElementById('themeToggle');
const errorBanner   = document.getElementById('errorBanner');
const metaSection   = document.getElementById('metaSection');
const progressSection = document.getElementById('progressSection');
const resultSection = document.getElementById('resultSection');
const audioOptions       = document.getElementById('audioOptions');
const videoOptions       = document.getElementById('videoOptions');
const resolutionSelector = document.getElementById('resolutionSelector');
const fmtAudio           = document.getElementById('fmtAudio');
const fmtVideo           = document.getElementById('fmtVideo');

const cookieFileInput = document.getElementById('cookieFileInput');
const cookieUploadBtn = document.getElementById('cookieUploadBtn');
const cookieActiveBar = document.getElementById('cookieActiveBar');
const cookieRemoveBtn = document.getElementById('cookieRemoveBtn');

const thumbnail     = document.getElementById('thumbnail');
const videoTitle    = document.getElementById('videoTitle');
const channelName   = document.getElementById('channelName');
const durationPill  = document.getElementById('durationPill');
const viewsPill     = document.getElementById('viewsPill');
const datePill      = document.getElementById('datePill');

const progressBar   = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const progressPct   = document.getElementById('progressPct');
const progressEta   = document.getElementById('progressEta');
const progressPhase = document.getElementById('progressPhase');
const progressTrack = document.querySelector('.progress-track');
const cancelBtn     = document.getElementById('cancelBtn');
const downloadLink  = document.getElementById('downloadLink');
const resultFilename = document.getElementById('resultFilename');

// ── State ─────────────────────────────────────────────────────────────────────

let currentTitle    = '';
let abortController = null;
let mediaType       = 'audio'; // 'audio' | 'video'
let etaSeconds      = null;
let etaInterval     = null;

// ── Theme ─────────────────────────────────────────────────────────────────────

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// ── Cookie Management ─────────────────────────────────────────────────────────

async function refreshCookieStatus() {
  try {
    const res = await fetch('/api/cookies/status');
    const { active } = await res.json();
    cookieUploadBtn.hidden = active;
    cookieActiveBar.hidden = !active;
  } catch {}
}

refreshCookieStatus();

cookieFileInput.addEventListener('change', async () => {
  const file = cookieFileInput.files[0];
  if (!file) return;
  const text = await file.text();
  const res = await fetch('/api/cookies', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
  });
  if (res.ok) {
    refreshCookieStatus();
  } else {
    const data = await res.json().catch(() => ({}));
    showError(data.error || 'Failed to upload cookies.');
  }
  cookieFileInput.value = '';
});

cookieRemoveBtn.addEventListener('click', async () => {
  await fetch('/api/cookies', { method: 'DELETE' });
  refreshCookieStatus();
});

// ── Format Toggle ─────────────────────────────────────────────────────────────

[fmtAudio, fmtVideo].forEach(btn => {
  btn.addEventListener('click', () => {
    mediaType = btn.dataset.fmt;
    fmtAudio.classList.toggle('active', mediaType === 'audio');
    fmtVideo.classList.toggle('active', mediaType === 'video');
    audioOptions.hidden = mediaType !== 'audio';
    videoOptions.hidden = mediaType !== 'video';
    downloadBtnLabel.textContent = mediaType === 'audio' ? 'Download MP3' : 'Download MP4';
  });
});

// ── URL Input Helpers ─────────────────────────────────────────────────────────

urlInput.addEventListener('input', () => {
  clearBtn.hidden = urlInput.value.length === 0;
  if (errorBanner.hidden === false) hideError();
});

urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') fetchBtn.click();
});

clearBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.hidden = true;
  urlInput.focus();
  hideError();
  hide(metaSection);
  hide(progressSection);
  hide(resultSection);
});

// ── Utility ───────────────────────────────────────────────────────────────────

function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

function showError(msg) {
  errorBanner.textContent = msg;
  show(errorBanner);
}

function hideError() { hide(errorBanner); }

function setLoading(btn, loading) {
  const text   = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  if (text)    text.hidden   = loading;
  if (spinner) spinner.hidden = !loading;
}

function setProgress(pct, label, phase, eta) {
  progressBar.classList.remove('indeterminate');
  progressBar.style.width = `${pct}%`;
  progressTrack.setAttribute('aria-valuenow', Math.round(pct));
  if (label) progressLabel.textContent = label;
  if (phase !== undefined) progressPhase.textContent = phase;
  progressPct.textContent = pct < 100 ? `${Math.round(pct)}%` : '';
  if (eta) updateEta(eta);
}

function setIndeterminate(label) {
  progressBar.classList.add('indeterminate');
  progressPct.textContent = '';
  if (label) progressLabel.textContent = label;
  progressPhase.textContent = '';
}

function renderEta(secs) {
  if (secs === null) { progressEta.textContent = ''; return; }
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const str = m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
  const text = `ETA ${str}`;
  if (progressEta.textContent === text) return;
  progressEta.classList.remove('eta-tick');
  void progressEta.offsetWidth;
  progressEta.classList.add('eta-tick');
  progressEta.textContent = text;
}

function updateEta(raw) {
  if (!raw) return;
  const parts = raw.split(':').map(Number);
  if (parts.some(isNaN)) return;
  etaSeconds = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  if (!etaInterval) {
    etaInterval = setInterval(() => {
      if (etaSeconds === null) return;
      etaSeconds = Math.max(0, etaSeconds - 1);
      renderEta(etaSeconds);
    }, 1000);
  }
}

function stopEta() {
  clearInterval(etaInterval);
  etaInterval = null;
  etaSeconds  = null;
  progressEta.textContent = '';
}

// ── Resolution Options ────────────────────────────────────────────────────────

const RES_META = {
  best: { kbps: 'Best', unit: '',  note: 'Auto-max' },
  360:  { kbps: '360',  unit: 'p', note: 'Small file' },
  480:  { kbps: '480',  unit: 'p', note: 'SD' },
  720:  { kbps: '720',  unit: 'p', note: 'HD' },
  1080: { kbps: '1080', unit: 'p', note: 'Full HD' },
  1440: { kbps: '1440', unit: 'p', note: '2K' },
  2160: { kbps: '4K',   unit: '',  note: 'Ultra HD' },
};

function renderResolutionOptions(resolutions) {
  // Always lead with "Best" — no cap, yt-dlp picks the highest quality available
  const allOptions = ['best', ...resolutions];

  resolutionSelector.innerHTML = allOptions.map(r => {
    const { kbps, unit, note } = RES_META[r] || { kbps: `${r}`, unit: 'p', note: '' };
    return `
      <label class="quality-opt">
        <input type="radio" name="resolution" value="${r}"${r === 'best' ? ' checked' : ''} />
        <span class="quality-label">
          <span class="quality-kbps">${kbps}</span>
          <span class="quality-unit">${unit}</span>
          <span class="quality-note">${note}</span>
        </span>
      </label>`;
  }).join('');
}

// ── Parse SSE from fetch ReadableStream ───────────────────────────────────────

async function* streamSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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

// ── Fetch Video Info ──────────────────────────────────────────────────────────

fetchBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { urlInput.focus(); return; }

  hideError();
  hide(metaSection);
  hide(progressSection);
  hide(resultSection);
  setLoading(fetchBtn, true);

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Failed to fetch video info.');
      return;
    }

    currentTitle = data.title;

    thumbnail.src = data.thumbnail || '';
    thumbnail.alt = data.title;
    videoTitle.textContent = data.title;
    channelName.textContent = data.channel;

    durationPill.textContent = data.duration;
    show(durationPill);

    if (data.viewCount) {
      viewsPill.textContent = `${data.viewCount} views`;
      show(viewsPill);
    } else {
      hide(viewsPill);
    }

    if (data.uploadDate) {
      datePill.textContent = new Date(data.uploadDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      show(datePill);
    } else {
      hide(datePill);
    }

    // Populate video resolution options based on what this video actually supports
    renderResolutionOptions(data.availableResolutions || [360, 480, 720, 1080]);

    show(metaSection);
  } catch (err) {
    showError('Network error — is the server running?');
  } finally {
    setLoading(fetchBtn, false);
  }
});

// ── Download ──────────────────────────────────────────────────────────────────

downloadBtn.addEventListener('click', async () => {
  const url        = urlInput.value.trim();
  if (!url) return;

  const quality    = document.querySelector('input[name="quality"]:checked')?.value    ?? '192';
  const resolution = document.querySelector('input[name="resolution"]:checked')?.value ?? '720';

  hideError();
  hide(resultSection);
  show(progressSection);
  setLoading(downloadBtn, true);
  setIndeterminate('Starting download…');

  abortController = new AbortController();
  stopEta();
  cancelBtn.disabled = false;

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mediaType, quality, resolution, title: currentTitle }),
      signal: abortController.signal,
    });

    if (!res.ok) {
      const data = await res.json();
      showError(data.error || 'Download failed.');
      hide(progressSection);
      return;
    }

    for await (const event of streamSSE(res)) {
      switch (event.type) {
        case 'start':
          setIndeterminate('Starting download…');
          break;

        case 'progress':
          if (event.phase === 'download') {
            const phaseNote = mediaType === 'video' ? 'Downloading streams (video then audio)…' : 'Fetching audio…';
            setProgress(event.progress, event.subLabel || 'Downloading…', phaseNote, event.eta);
          } else if (event.phase === 'convert') {
            setIndeterminate(event.subLabel || 'Converting…');
          } else if (event.phase === 'merge') {
            setIndeterminate(event.subLabel || 'Merging video + audio…');
          }
          break;

        case 'done': {
          const ext      = event.ext || 'mp3';
          const filename = event.filename || `${currentTitle || 'audio'}.${ext}`;
          const safeFilename = filename.replace(/[<>:"/\\|?*]/g, '');
          const baseName = safeFilename.replace(new RegExp(`\\.${ext}$`), '');

          downloadLink.href = `/api/file/${event.fileId}?ext=${ext}&name=${encodeURIComponent(baseName)}`;
          downloadLink.setAttribute('download', safeFilename);
          resultFilename.textContent = safeFilename;

          hide(progressSection);
          show(resultSection);
          downloadLink.click();
          break;
        }

        case 'error':
          showError(event.message || 'Download failed.');
          hide(progressSection);
          break;
      }
    }
  } catch (err) {
    hide(progressSection);
    if (err.name !== 'AbortError') {
      showError('Connection lost — please try again.');
    }
  } finally {
    setLoading(downloadBtn, false);
    cancelBtn.disabled = true;
    abortController = null;
    stopEta();
  }
});

// ── Cancel ────────────────────────────────────────────────────────────────────

cancelBtn.addEventListener('click', () => {
  if (abortController) {
    cancelBtn.disabled = true;
    abortController.abort();
  }
});

// ── Reset ─────────────────────────────────────────────────────────────────────

resetBtn.addEventListener('click', () => {
  urlInput.value = '';
  clearBtn.hidden = true;
  currentTitle = '';
  mediaType = 'audio';

  fmtAudio.classList.add('active');
  fmtVideo.classList.remove('active');
  audioOptions.hidden = false;
  videoOptions.hidden = true;
  downloadBtnLabel.textContent = 'Download MP3';

  hide(metaSection);
  hide(progressSection);
  hide(resultSection);
  hideError();

  urlInput.focus();
});
