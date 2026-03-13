# In-App Auto-Updates

## Summary

Implement auto-update functionality within the Flint experience. Users should be notified of available updates and be able to install them without leaving the app or visiting a website.

## Context

Flint is a Tauri v2 desktop app (macOS, Windows, Linux). Tauri has a built-in updater plugin (`tauri-plugin-updater`) that supports:
- Checking for updates against a JSON endpoint or GitHub Releases
- Downloading and installing updates in the background
- Restart-to-apply flow

## Requirements

- Check for updates on app launch (and periodically while running)
- Non-intrusive notification: subtle indicator in the tray menu and/or settings window
- User-initiated install: "Update available — click to install" (not forced)
- Progress indication during download
- Restart prompt after install

## UX

- **Tray menu**: "Update Available (v0.2.0)" menu item appears when an update is ready
- **Settings → General**: Shows current version, update status, and "Check for Updates" button
- No modal popups or blocking dialogs — updates are optional and non-disruptive

## Technical Notes

- Tauri plugin: `tauri-plugin-updater` (v2)
- Update source: likely GitHub Releases with a JSON manifest
- Signing: updates must be signed (Tauri handles this with a keypair)
- Platform: each platform has its own update artifact (.tar.gz on macOS, .msi on Windows, .AppImage on Linux)

## To Expand Later

- Update channel (stable / beta)
- Release notes display
- Auto-install option (Settings toggle)
- Rollback on failure
