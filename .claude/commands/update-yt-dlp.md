Update yt-dlp to the latest version.

1. Run `yt-dlp --version` and capture the current version.

2. Try to update using whichever method is available (try in this order):
   - If on macOS and brew is available: `brew upgrade yt-dlp`
   - If installed via pip: `pip install -U yt-dlp`
   - If on Windows and winget is available: `winget upgrade yt-dlp.yt-dlp`
   - Otherwise use the self-update flag: `yt-dlp -U`

3. Run `yt-dlp --version` again and show the before → after version numbers.

4. If yt-dlp is not installed at all, tell the user to install it:
   - macOS: `brew install yt-dlp`
   - Windows: `winget install yt-dlp.yt-dlp`
   - cross-platform: `pip install yt-dlp`

5. Remind the user that keeping yt-dlp up to date is important — YouTube regularly changes its API and older versions may fail with 403 errors or stop working entirely.
