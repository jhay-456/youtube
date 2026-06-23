Check that all required system dependencies for MP3ify are installed and show their versions.

Run these checks in parallel:
1. `yt-dlp --version` — report version or "NOT INSTALLED"
2. `ffmpeg -version` — report first line only or "NOT INSTALLED"
3. `node --version` — report version
4. `npm --version` — report version

Then check that node_modules exists (look for package-lock.json or the node_modules directory), and report if `npm install` needs to be run.

Print a clear summary: which deps are ready ✓ and which are missing ✗ with the exact install command to fix each one:

| Dep | macOS | Windows | Linux |
|-----|-------|---------|-------|
| yt-dlp | `brew install yt-dlp` | `winget install yt-dlp.yt-dlp` | `pip install yt-dlp` |
| ffmpeg | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | `sudo apt install ffmpeg` |
| Node.js | `brew install node` | `winget install OpenJS.NodeJS` | `sudo apt install nodejs` |

After installing any binaries on Windows, restart the terminal so the new PATH takes effect.
