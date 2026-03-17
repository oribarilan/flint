# Known Gaps

Tracking cross-platform and feature gaps to address before release.

## Search

Flint's search is built on **macOS Spotlight** — it does not build or maintain its own file index. On macOS, Spotlight handles all file indexing, watching, exclusions, and package detection. Flint queries it at runtime.

**Windows and Linux search is not yet implemented.** These platforms will need a different backend (Windows Search, `plocate`, or a custom walker). See `.todo/search-v3.md` for the plan.

## Cross-Platform

### App Icon Extraction
- **macOS**: ✅ Extracts icons from `.icns` via `Info.plist`
- **Windows**: ❌ Not yet implemented
- **Linux**: ❌ Not yet implemented

### File & App Search
- **macOS**: ✅ Spotlight-backed (apps + files)
- **Windows**: ❌ Not yet implemented — needs Windows Search API or similar
- **Linux**: ❌ Not yet implemented — needs `plocate`, Tracker, or custom walker

## Features (Not Yet Implemented)

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
