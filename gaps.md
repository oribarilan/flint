# Known Gaps

Tracking cross-platform and feature gaps to address before release.

## Cross-Platform

### App Icon Extraction
- **macOS**: ✅ Extracts icons from `.icns` via `Info.plist`
- **Windows**: ❌ No icon extraction. Would need to read `.exe` embedded icons (PE resource section) or `.lnk` shortcut icons
- **Linux**: ❌ No icon extraction. Would need to read `.desktop` files and resolve icon themes (`hicolor`, `Adwaita`, etc.) from `/usr/share/icons/`

### Indexed Directories
- **macOS**: ✅ `~/Desktop`, `~/Documents`, `~/Downloads`, `/Applications`
- **Windows**: ❌ No platform roots yet. Should add `C:\Program Files`, `C:\Program Files (x86)`, Start Menu shortcuts
- **Linux**: ❌ No platform roots yet. Should add `/usr/share/applications` (`.desktop` files), `/usr/local/bin`, `~/.local/share/applications`

### Package Directory Blocklist
- **macOS**: ✅ `.app`, `.framework`, `.bundle`, `.plugin`, `.prefPane`, `.kext`, `.photoslibrary`, `.musiclibrary`, `.xcodeproj`, `.xcworkspace`, `.playground`
- **Windows**: ❌ No package-style dirs identified yet. Consider skipping `WindowsApps`, `WinSxS`
- **Linux**: ❌ No package-style dirs identified yet

## Features (Not Yet Implemented)

### Phase 3b — Full System Search
- Expand indexed scope to full `~` directory
- Filesystem event watching via `notify` crate for incremental updates
- Persisted index cache for fast cold start

### Phase 4 — Copilot Authentication
- OAuth Device Flow with shared Copilot client ID
- Token storage in OS keychain
- Automatic Copilot token refresh

### Phase 5 — AI Chat
- Streaming chat completions via Copilot API
- Markdown rendering with syntax highlighting
- Conversation history (in-memory, per-session)

### Phase 6 — Logging & Observability
- Structured logging with daily rotation
- Frontend error forwarding to Rust logger
- Performance instrumentation
