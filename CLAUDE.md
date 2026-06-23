# MP3ify — Media Downloader · Claude Project Guide

## What this project does

Personal web app for downloading audio or video from YouTube and other supported sites (Vimeo, SoundCloud, TikTok, etc.).
Runs as a local or self-hosted server, accessible from any device on the network.
Outputs MP3 (audio) or MP4 (video).

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
| `GET`  | `/api/cookies/status` | Check if a cookies.txt is active |
| `POST` | `/api/cookies` | Upload a Netscape-format cookies.txt (text/plain body) |
| `DELETE` | `/api/cookies` | Remove the active cookies.txt |

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
  "resolution": "1080",        // video only: "360"|"480"|"720"|"1080"|"1440"|"2160"|"best"
  "title": "Video title"       // used for the output filename
}
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP listen port |
| `AUTH_USER` | — | Basic auth username (both must be set to enable auth) |
| `AUTH_PASS` | — | Basic auth password |

## Key design decisions

**403 from YouTube** — fixed by `--extractor-args youtube:player_client=android_creator`. Applied only when the URL is a YouTube URL (`isYouTubeUrl()`). Non-YouTube URLs skip this flag.

**QuickTime / Mac compatibility** — The video format string prefers H.264 (`[vcodec^=avc1]`) before falling back to VP9/AV1. YouTube's 1080p+ streams are usually VP9/AV1 only, so for 1440p/4K the fallback kicks in and the file may require VLC or IINA to play.

**Non-ASCII filenames** (Thai, Japanese, etc.) — the `Content-Disposition` header uses RFC 5987 encoding (`filename*=UTF-8''…`) alongside an ASCII-stripped fallback. Raw UTF-8 in HTTP headers causes Node to throw, which browsers see as "Unknown server error."

**Multi-site support** — `isValidUrl()` accepts any `http://` or `https://` URL. YouTube-specific extractor args are only applied when `isYouTubeUrl()` returns true. yt-dlp handles the rest (Vimeo, SoundCloud, TikTok, etc.).

**Video download progress** — yt-dlp fetches video stream and audio stream separately before merging. `createProgressParser(mediaType)` is a closure that tracks which stream is active and maps video-stream download to 0–50% and audio-stream download to 50–100%.

**Dynamic resolution options** — `/api/info` parses yt-dlp's `formats` array and returns only the heights the specific video actually has (`STANDARD_HEIGHTS = [360, 480, 720, 1080, 1440, 2160]`). The frontend renders those as radio buttons. Always prepends "Best" (auto-max) as the first/default option.

**Temp file lifecycle** — files land in `temp/<uuid>.mp3|mp4`, streamed to the client via `fs.createReadStream`, then deleted in the `stream.on('close')` callback. `cleanTempDir()` runs hourly via `setInterval` and removes anything older than 1 hour.

**SSE over POST** — the download endpoint streams SSE directly from the POST response body. The client reads it via `response.body.getReader()` rather than `EventSource` (which only supports GET).

**Windows PATH injection** — on `process.platform === 'win32'`, `SPAWN_ENV` dynamically scans the winget packages directory to find yt-dlp and ffmpeg at startup (handles version upgrades without hardcoded version strings). On macOS/Linux, `process.env` is used as-is.

**Cookie management** — `cookies.txt` (Netscape format) is saved to the project root. `cookieArgs()` returns `['--cookies', COOKIES_FILE]` when the file exists, or `[]` when it doesn't. Useful for member-only or login-gated content.

**UUID path traversal prevention** — `fileId` is validated against `UUID_RE` before constructing any file path.

## Frontend architecture (`public/app.js`)

- `state` — single object holding `title`, `mediaType`, `abortController`, `etaSeconds`, `etaInterval`
- `el` — single object with all DOM refs, grouped by section
- `setMediaType(type)` — shared between format-toggle handler and reset handler; eliminates duplicate logic
- `renderResolutionOptions(resolutions)` — uses `document.createElement` + `textContent` (not innerHTML)
- `streamSSE(response)` — async generator that reads the fetch `ReadableStream` and yields parsed JSON events
- ETA countdown — `updateEta(raw)` parses "MM:SS" or "HH:MM:SS", `renderEta(secs)` with CSS animation tick

## Common tasks

- **Update yt-dlp**: run `/update-yt-dlp`
- **Start dev server**: run `/dev`
- **Check system deps**: run `/check-deps`
