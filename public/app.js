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
const audioOptions  = document.getElementById('audioOptions');
const videoOptions  = document.getElementById('videoOptions');
const fmtAudio      = document.getElementById('fmtAudio');
const fmtVideo      = document.getElementById('fmtVideo');

const thumbnail     = document.getElementById('thumbnail');
const videoTitle    = document.getElementById('videoTitle');
const channelName   = document.getElementById('channelName');
const durationPill  = document.getElementById('durationPill');
const viewsPill     = document.getElementById('viewsPill');
const datePill      = document.getElementById('datePill');

const progressBar   = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const progressPct   = document.getElementById('progressPct');
const progressPhase = document.getElementById('progressPhase');
const progressTrack = document.querySelector('.progress-track');
const downloadLink  = document.getElementById('downloadLink');
const resultFilename = document.getElementById('resultFilename');

// ── State ─────────────────────────────────────────────────────────────────────

let currentTitle    = '';
let abortController = null;
let mediaType       = 'audio'; // 'audio' | 'video'

// ── Theme ─────────────────────────────────────────────────────────────────────

const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
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

function setProgress(pct, label, phase) {
  progressBar.classList.remove('indeterminate');
  progressBar.style.width = `${pct}%`;
  progressTrack.setAttribute('aria-valuenow', Math.round(pct));
  if (label) progressLabel.textContent = label;
  if (phase !== undefined) progressPhase.textContent = phase;
  progressPct.textContent = pct < 100 ? `${Math.round(pct)}%` : '';
}

function setIndeterminate(label) {
  progressBar.classList.add('indeterminate');
  progressPct.textContent = '';
  if (label) progressLabel.textContent = label;
  progressPhase.textContent = '';
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
            const eta = event.eta ? ` — ETA ${event.eta}` : '';
            const label = (event.subLabel || 'Downloading…') + eta;
            const phaseNote = mediaType === 'video' ? 'Downloading streams (video then audio)…' : 'Fetching audio…';
            setProgress(event.progress, label, phaseNote);
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
    if (err.name !== 'AbortError') {
      showError('Connection lost — please try again.');
      hide(progressSection);
    }
  } finally {
    setLoading(downloadBtn, false);
    abortController = null;
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
