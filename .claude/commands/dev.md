Start the MP3ify dev server.

1. First check system dependencies are present:
   - Run `which yt-dlp` (macOS/Linux) or `where yt-dlp` (Windows) — if missing, tell the user to install it:
     - macOS: `brew install yt-dlp`
     - Windows: `winget install yt-dlp.yt-dlp`
     - cross-platform: `pip install yt-dlp`
   - Run `which ffmpeg` (macOS/Linux) or `where ffmpeg` (Windows) — if missing:
     - macOS: `brew install ffmpeg`
     - Windows: `winget install Gyan.FFmpeg`
     - Linux: `sudo apt install ffmpeg`

2. If both deps exist, run `npm run dev` in the background.

3. After 2 seconds, curl `http://localhost:3001` and confirm it returns HTML.

4. Tell the user the server is running at http://localhost:3001 and to open it in a browser.
