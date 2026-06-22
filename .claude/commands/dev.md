Start the YouTube MP3/MP4 downloader dev server.

1. First check system dependencies are present:
   - Run `which yt-dlp` — if missing, tell the user to run `brew install yt-dlp` (macOS) or `pip install yt-dlp`
   - Run `which ffmpeg` — if missing, tell the user to run `brew install ffmpeg` (macOS) or `sudo apt install ffmpeg` (Linux)

2. If both deps exist, run `npm run dev` in the background.

3. After 2 seconds, curl `http://localhost:3001` and confirm it returns HTML.

4. Tell the user the server is running at http://localhost:3001 and remind them to open it in a browser.
