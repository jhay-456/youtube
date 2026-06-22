# YouTube MP3 Downloader

A local web app that downloads audio from YouTube URLs and converts them to MP3.

> **Personal use only.** Downloading copyrighted content may violate YouTube's Terms of Service and applicable copyright law. This tool is intended for non-copyrighted or Creative Commons licensed content. Use responsibly.

---

## System Dependencies

These must be installed before running the app.

### 1. ffmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows — download from https://ffmpeg.org/download.html and add to PATH
```

### 2. yt-dlp

```bash
# macOS
brew install yt-dlp

# pip (cross-platform)
pip install yt-dlp

# Or download the binary directly:
# https://github.com/yt-dlp/yt-dlp/releases/latest
```

Verify both are available:
```bash
yt-dlp --version
ffmpeg -version
```

---

## Setup

```bash
# 1. Install Node.js dependencies
npm install

# 2. Start the server
npm start
```

Open **http://localhost:3000** in your browser.

For auto-restart during development:
```bash
npm run dev   # requires nodemon (installed as devDependency)
```

---

## Usage

1. Paste a YouTube URL (video, short, or youtu.be link)
2. Click **Fetch Info** to preview the video
3. Choose your audio quality (128 / 192 / 320 kbps)
4. Click **Download MP3** — progress is shown in real time
5. The file downloads automatically when conversion is complete

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/info` | Fetch video metadata |
| `POST` | `/api/download` | Download + convert (SSE stream) |
| `GET` | `/api/file/:fileId` | Retrieve the converted MP3 |

### POST /api/info

**Request body:**
```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

**Response:**
```json
{
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": "3:45",
  "channel": "Channel Name",
  "viewCount": "1,234,567",
  "uploadDate": "2024-01-15"
}
```

### POST /api/download

**Request body:**
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "quality": "192",
  "title": "Video Title"
}
```

Streams Server-Sent Events (SSE):

```
data: {"type":"start","message":"Starting download…"}
data: {"type":"progress","phase":"download","progress":45.2,"eta":"00:12"}
data: {"type":"progress","phase":"convert","progress":100}
data: {"type":"done","fileId":"uuid","filename":"Video Title.mp3"}
```

### GET /api/file/:fileId?name=Title

Downloads the MP3 file. The file is deleted from the server after being served.

---

## Rate Limits

- **Info endpoint:** 20 requests per 15 minutes
- **Download endpoint:** 10 downloads per hour

---

## Configuration

| Environment variable | Default | Description |
|----------------------|---------|-------------|
| `PORT` | `3000` | HTTP port to listen on |

```bash
PORT=8080 npm start
```

---

## Project Structure

```
.
├── server.js          # Express backend
├── package.json
├── public/
│   ├── index.html     # Frontend
│   ├── style.css
│   └── app.js
└── temp/              # Temporary MP3 files (auto-cleaned)
```

Temp files are cleaned up automatically after being served, and any files older than 1 hour are purged on an hourly interval.
