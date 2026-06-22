Check that all required system dependencies for the YouTube downloader are installed and show their versions.

Run these checks in parallel:
1. `yt-dlp --version` — report version or "NOT INSTALLED"
2. `ffmpeg -version` — report version (first line only) or "NOT INSTALLED"
3. `node --version` — report version
4. `npm --version` — report version

Then check that node_modules exists (`ls node_modules` or check package-lock.json), and report if npm install needs to be run.

Print a clear summary: which deps are ready ✓ and which are missing with the install command to fix them.
