# MP3ify — YouTube Audio & Video Downloader

A personal, self-hosted web app for downloading YouTube content as **MP3** (audio) or **MP4** (video).
Runs on your machine or a private server and is accessible from any device — phone, tablet, laptop.

> **For personal use only.** Downloading copyrighted content may violate YouTube's Terms of Service and applicable copyright law. This tool is intended for non-copyrighted or Creative Commons licensed content. You are solely responsible for how you use it.

---

## Features

- Download audio as **MP3** at 128 / 192 / 320 kbps
- Download video as **MP4** — resolution options are dynamic (shows only what the video actually supports, up to **4K**)
- Live progress bar with ETA during download and conversion
- Video metadata preview — thumbnail, title, channel, duration, view count
- Dark / light mode toggle with local storage persistence
- Password protection for private server deployments
- Responsive design — works on mobile

---

## System Requirements

These must be installed before running:

### yt-dlp

```bash
# macOS
brew install yt-dlp

# pip (cross-platform)
pip install yt-dlp

# Self-update after installing
yt-dlp -U
```

### ffmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg
```

Verify both are available:

```bash
yt-dlp --version
ffmpeg -version
```

### Node.js

Node.js **v18 or newer** is required. Check with `node --version`.

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

Open **http://localhost:3001** in your browser.

For development with auto-restart:

```bash
npm run dev
```

---

## Usage

1. Paste a YouTube URL (standard watch URL, short URL, or Shorts)
2. Click **Fetch Info** — a preview card shows the thumbnail, title, and metadata
3. Choose **Audio MP3** or **Video MP4**
4. Select quality (audio bitrate or video resolution — only what the video supports is shown)
5. Click **Download** — a live progress bar tracks the download and conversion
6. The file saves automatically when ready

---

## Deploying for Multi-Device Access

If you want to use this from your phone or other devices, deploy it to a private server.

### Option A — Railway (easiest)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Railway detects the `Dockerfile` automatically and builds the image (~3 min first build)
4. In **Variables**, set:

   | Variable | Value |
   |----------|-------|
   | `AUTH_USER` | your chosen username |
   | `AUTH_PASS` | a strong password |
   | `PORT` | `3001` |

5. Go to **Settings → Networking → Generate Domain** to get your HTTPS URL

Cost: ~$5/month or within Railway's free credit tier.

### Option B — Render

Same steps as Railway. Use **Docker** environment.

> **Note:** Render's free tier sleeps after 15 min of inactivity. Use the paid tier ($7/mo) for always-on access.

### Option C — Any VPS (DigitalOcean, Linode, etc.)

```bash
# On your server (Ubuntu)
sudo apt install docker.io
git clone https://github.com/YOUR_USERNAME/YOUR_REPO
cd YOUR_REPO

docker build -t mp3ify .
docker run -d \
  -p 3001:3001 \
  -e AUTH_USER=jhay \
  -e AUTH_PASS=yourpassword \
  --restart unless-stopped \
  mp3ify
```

Add an nginx reverse proxy + Let's Encrypt for HTTPS.

---

## Docker (local)

```bash
# Build
docker build -t mp3ify .

# Run (no auth)
docker run -p 3001:3001 mp3ify

# Run (with password protection)
docker run -p 3001:3001 \
  -e AUTH_USER=jhay \
  -e AUTH_PASS=secret \
  mp3ify
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `AUTH_USER` | — | Basic auth username — if unset, no login required |
| `AUTH_PASS` | — | Basic auth password |

Both `AUTH_USER` and `AUTH_PASS` must be set together to enable password protection.

---

## API Reference

### `POST /api/info`

Fetch metadata for a YouTube URL.

**Request**
```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

**Response**
```json
{
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": "3:45",
  "channel": "Channel Name",
  "viewCount": "1,234,567",
  "uploadDate": "2024-01-15",
  "availableResolutions": [360, 480, 720, 1080, 2160]
}
```

`availableResolutions` lists only the heights the specific video actually supports (up to 2160 = 4K).

---

### `POST /api/download`

Start a download. Streams **Server-Sent Events** until done.

**Request**
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "mediaType": "audio",
  "quality": "192",
  "resolution": "1080",
  "title": "Video Title"
}
```

| Field | Values |
|-------|--------|
| `mediaType` | `"audio"` or `"video"` |
| `quality` | `"128"` / `"192"` / `"320"` (audio only) |
| `resolution` | `"360"` / `"480"` / `"720"` / `"1080"` / `"1440"` / `"2160"` (video only) |

**SSE events streamed in response**

```
data: {"type":"start"}
data: {"type":"progress","phase":"download","progress":45.2,"eta":"00:14","subLabel":"Downloading video stream…"}
data: {"type":"progress","phase":"merge","subLabel":"Merging video + audio…"}
data: {"type":"done","fileId":"uuid","ext":"mp4","filename":"Title.mp4"}
data: {"type":"error","message":"…"}
```

---

### `GET /api/file/:fileId?ext=mp3&name=Title`

Download the converted file. Deleted from the server immediately after streaming.

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/info` | 20 requests per 15 minutes |
| `/api/download` | 10 downloads per hour |

---

## Claude Code Commands

This project includes custom slash commands for Claude Code:

| Command | Description |
|---------|-------------|
| `/dev` | Check system deps and start the dev server |
| `/check-deps` | Verify yt-dlp, ffmpeg, and Node.js are all installed |
| `/update-yt-dlp` | Update yt-dlp to the latest version |

---

## Project Structure

```
.
├── server.js              Backend — Express API
├── public/
│   ├── index.html         Frontend UI
│   ├── style.css          Theming and layout
│   └── app.js             Frontend logic and SSE handling
├── Dockerfile             Production container
├── .dockerignore
├── CLAUDE.md              Project guide for Claude Code
├── .claude/
│   └── commands/          Custom Claude Code slash commands
├── package.json
└── temp/                  Temp download files (auto-cleaned)
```

---

## Troubleshooting

**403 Forbidden from YouTube**
yt-dlp defaults to the web client which YouTube blocks. The app already passes `--extractor-args youtube:player_client=android,ios` to use the mobile clients instead. If you still get 403, run `yt-dlp -U` to update to the latest version.

**"Unknown server error" on download**
Usually caused by non-ASCII characters (Thai, Japanese, etc.) in the filename being put raw into HTTP headers. This is fixed in the current version via RFC 5987 header encoding. If you see it, make sure you're running the latest code.

**Video quality option not showing 4K**
The video doesn't have a 4K version available. Resolution options are dynamic — only resolutions the video actually has are shown.

**yt-dlp not found**
Install it with `brew install yt-dlp` (macOS) or `pip install yt-dlp`, then restart the server.
