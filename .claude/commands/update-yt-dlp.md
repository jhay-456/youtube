Update yt-dlp to the latest version.

1. Run `yt-dlp --version` and capture the current version.

2. Try to update using whichever method is available:
   - If installed via brew: `brew upgrade yt-dlp`
   - If installed via pip: `pip install -U yt-dlp`
   - Otherwise try the self-update flag: `yt-dlp -U`

3. Run `yt-dlp --version` again and show the before → after version numbers.

4. If yt-dlp is not installed at all, tell the user to install it with `brew install yt-dlp` (macOS) or `pip install yt-dlp`.
