# YouTube MP3/MP4 Downloader — Claude Project Guide

## What this project does

Personal web app for downloading YouTube audio (MP3) or video (MP4).
Runs as a local or self-hosted server, accessible from any device on the network.

## Stack

- **Backend**: Node.js ≥18, Express 4
- **npm packages**: `express`, `express-rate-limit`, `express-basic-auth`, `uuid`
- **System binaries**: `yt-dlp` (download engine), `ffmpeg` (audio/video conversion)
- **Frontend**: Vanilla HTML + CSS + JS — no build step, no framework

## File map

```
server.js              Express server — all API routes live here
public/
  index.html           Single-page UI
  style.css            CSS custom properties, dark/light theme via [data-theme]
  app.js               All frontend logic; SSE stream parsed via fetch ReadableStream
Dockerfile             Production container (installs yt-dlp + ffmpeg on Debian slim)
.dockerignore
```

## Running locally

```bash
npm start       # port 3001
npm run dev     # nodemon auto-restart (needs nodemon devDependency)
```

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/info` | Fetch metadata + available video resolutions |
| `POST` | `/api/download` | SSE stream — progress events, then `done` or `error` |
| `GET`  | `/api/file/:fileId` | Stream the file to client, delete after serving |

### SSE event shapes (`/api/download`)

```json
{ "type": "start" }
{ "type": "progress", "phase": "download", "progress": 45.2, "eta": "00:12", "subLabel": "Downloading video stream…" }
{ "type": "progress", "phase": "convert", "subLabel": "Converting to MP3…" }
{ "type": "progress", "phase": "merge",   "subLabel": "Merging video + audio…" }
{ "type": "done",  "fileId": "<uuid>", "ext": "mp3", "filename": "Title.mp3" }
{ "type": "error", "message": "…" }
```

### `/api/download` request body

```json
{
  "url": "https://youtube.com/watch?v=…",
  "mediaType": "audio",        // "audio" | "video"
  "quality": "192",            // audio only: "128" | "192" | "320"
  "resolution": "1080",        // video only: "360"|"480"|"720"|"1080"|"1440"|"2160"
  "title": "Video title"       // used for the output filename
}
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP listen port |
| `AUTH_USER` | — | Basic auth username (unset = no auth) |
| `AUTH_PASS` | — | Basic auth password |

## Key design decisions

**403 from YouTube** — fixed by `--extractor-args youtube:player_client=android,ios`. Both info and download endpoints carry this flag.

**Non-ASCII filenames** (Thai, Japanese, etc.) — the `Content-Disposition` header uses RFC 5987 encoding (`filename*=UTF-8''…`) alongside an ASCII-stripped fallback. Putting raw UTF-8 in HTTP headers causes Node to throw, which browsers see as "Unknown server error."

**Video download progress** — yt-dlp fetches the video stream and audio stream separately before merging. The frontend maps video-stream download to 0–50% and audio-stream download to 50–100%.

**Dynamic resolution options** — `/api/info` parses yt-dlp's `formats` array and returns only the heights the specific video actually has. The frontend renders those as radio buttons. Supports up to 4K (2160p).

**Temp file lifecycle** — files land in `temp/<uuid>.mp3|mp4`, streamed to the client via `fs.createReadStream`, then deleted in the `stream.on('close')` callback. A `setInterval` sweeps the dir hourly for anything older than 1 hour (handles aborted downloads).

**SSE over POST** — the download endpoint streams SSE directly from the POST response body. The client reads it via `response.body.getReader()` rather than `EventSource` (which only supports GET).

## Common tasks

- **Update yt-dlp**: run `/update-yt-dlp` or `yt-dlp -U`
- **Start dev server**: run `/dev`
- **Check system deps**: run `/check-deps`
