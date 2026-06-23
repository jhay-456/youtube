# MP3ify — Media Downloader

A personal, self-hosted web app for downloading audio or video from YouTube and other supported sites.
Save as **MP3** (audio) or **MP4** (video). Runs on your machine or a private server and is accessible from any device — phone, tablet, laptop.

> **Personal use only.** Only download content you have the right to download. Downloading copyrighted material may violate the terms of service of the source platform and applicable copyright law. You are solely responsible for how you use this tool.

---

## Features

- Download audio as **MP3** at 128 / 192 / 320 kbps
- Download video as **MP4** — resolution options are dynamic (shows only what the video actually supports, up to **4K**)
- **"Best" quality option** — lets yt-dlp auto-select the highest available resolution
- Prefers **H.264** video codec for QuickTime / Mac compatibility (falls back to VP9/AV1 when H.264 isn't available at that resolution)
- Supports **YouTube, Vimeo, SoundCloud, TikTok** and hundreds of other sites via yt-dlp
- **Cookie upload** — upload a `cookies.txt` to access login-gated or member-only content
- Live progress bar with ETA during download and conversion
- Video metadata preview — thumbnail, title, channel, duration, view count
- Dark / light mode toggle with local storage persistence
- Password protection for private server deployments
- Responsive design — works on mobile
- Runs on **macOS and Windows**

---

## System Requirements

### yt-dlp

```bash
# macOS
brew install yt-dlp

# Windows
winget install yt-dlp.yt-dlp

# Cross-platform (pip)
pip install yt-dlp
```

### ffmpeg

```bash
# macOS
brew install ffmpeg

# Windows
winget install Gyan.FFmpeg

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

> **Windows note:** After installing yt-dlp or ffmpeg via winget, restart your terminal so the new PATH takes effect. The server also injects the winget packages directory into the spawn environment automatically, so it will find them even if your terminal PATH hasn't refreshed yet.

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

1. Paste a URL (YouTube, Vimeo, SoundCloud, TikTok, or any yt-dlp-supported site)
2. Click **Fetch Info** — a preview card shows the thumbnail, title, and metadata
3. Choose **Audio MP3** or **Video MP4**
4. Select quality (audio bitrate or video resolution — only what the video supports is shown)
5. Click **Download** — a live progress bar tracks the download and conversion
6. The file saves automatically when ready

---

## Cookie Upload (for member-only content)

Some sites require you to be logged in to access HD or member-only content.

1. Export your browser cookies as a Netscape-format `cookies.txt` file (use a browser extension like [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc))
2. Click the **Cookies** button in the header
3. Select your `cookies.txt` file
4. The green dot indicates cookies are active — all subsequent downloads will use them
5. Click the ✕ on the active badge to remove cookies

---

## QuickTime Compatibility (Mac)

The app prefers H.264 video so files open in QuickTime Player without issues.

- **720p and below** — H.264 almost always available ✓
- **1080p** — H.264 usually available ✓
- **1440p / 4K** — YouTube rarely offers H.264 at these resolutions; the file will be VP9/AV1

If a file won't open in QuickTime, install **[IINA](https://iina.io/)** (free, Mac-native) or **VLC** — both play VP9/AV1 without any issues.

---

## Deploying for Multi-Device Access

Deploy to a private server to use the app from your phone or other devices.

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
| `AUTH_USER` | — | Basic auth username — both `AUTH_USER` and `AUTH_PASS` must be set together |
| `AUTH_PASS` | — | Basic auth password |

---

## API Reference

### `POST /api/info`

Fetch metadata for a URL.

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
  "resolution": "best",
  "title": "Video Title"
}
```

| Field | Values |
|-------|--------|
| `mediaType` | `"audio"` or `"video"` |
| `quality` | `"128"` / `"192"` / `"320"` (audio only) |
| `resolution` | `"360"` / `"480"` / `"720"` / `"1080"` / `"1440"` / `"2160"` / `"best"` (video only) |

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

### Cookie routes

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| `GET` | `/api/cookies/status` | — | Returns `{ "active": true/false }` |
| `POST` | `/api/cookies` | Netscape cookies.txt as `text/plain` | Upload cookies |
| `DELETE` | `/api/cookies` | — | Remove active cookies |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/info` | 20 requests per 15 minutes |
| `/api/download` | 10 downloads per hour |

---

## Claude Code Commands

| Command | Description |
|---------|-------------|
| `/dev` | Check system deps and start the dev server |
| `/check-deps` | Verify yt-dlp, ffmpeg, and Node.js are installed (with install commands for macOS/Windows/Linux) |
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
└── temp/                  Temp download files (auto-cleaned hourly)
```

---

## Troubleshooting

**403 Forbidden from YouTube**
yt-dlp defaults to the web client which YouTube blocks. The app passes `--extractor-args youtube:player_client=android_creator` automatically. If you still see 403, run `/update-yt-dlp` to get the latest version.

**File won't open in QuickTime**
YouTube's 1440p and 4K streams use VP9/AV1 codec which QuickTime doesn't support. Use [IINA](https://iina.io/) or VLC instead. For 1080p and below, the app prefers H.264 which QuickTime handles fine.

**"Unknown server error" on download**
Caused by non-ASCII characters (Thai, Japanese, etc.) in the filename going into HTTP headers raw. This is fixed in the current version via RFC 5987 encoding.

**Video quality option not showing 4K**
The video doesn't have a 4K version available. Resolution options are dynamic — only what the video actually has is shown.

**yt-dlp not found (Windows)**
After installing via winget, restart your terminal. The server also searches the winget packages directory automatically, but a terminal restart ensures your system PATH is updated.

**yt-dlp not found (macOS)**
Install with `brew install yt-dlp` then restart the server.
