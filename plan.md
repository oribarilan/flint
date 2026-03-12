# Flint

An AI-native application launcher, built to feel fast and invisible. Flint hooks into your existing GitHub Copilot subscription so there's nothing extra to pay for — just authenticate and go.

## What It Does

- **Launch bar**: A floating overlay activated by a global hotkey (`Cmd+Shift+Space`). Type to search, arrow keys to navigate, Enter to open.
- **File search**: Instantly find files on your machine with fuzzy matching.
- **AI chat**: Ask Flint anything, right from the launcher. Streaming responses, markdown rendering, inline.

## Tech Stack

| Layer      | Choice                                    |
|------------|-------------------------------------------|
| Shell      | Tauri v2 (Rust backend)                   |
| Frontend   | React + TypeScript (Vite)                 |
| State      | Zustand                                   |
| AI         | GitHub Copilot (OAuth Device Flow)        |
| Fuzzy      | `nucleo` crate                            |
| Testing    | Rust: `cargo test` / Frontend: Vitest + React Testing Library |
| Linting    | Rust: Clippy (strict) + rustfmt / JS: ESLint (strict) + Prettier |
| Platforms  | macOS, Windows, Linux                     |

## Architecture

```
┌─────────────────────────────────────────────┐
│                React Frontend               │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Search  │ │ Results  │ │  AI Chat    │  │
│  │   Bar   │ │   List   │ │   Panel     │  │
│  └─────────┘ └──────────┘ └─────────────┘  │
│          Zustand (state management)         │
├─────────────────────────────────────────────┤
│              Tauri IPC Bridge               │
├─────────────────────────────────────────────┤
│              Rust Backend                   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ │
│  │  File     │ │  Copilot  │ │  Window   │ │
│  │  Indexer  │ │  Auth +   │ │  Manager  │ │
│  │  + Search │ │  Chat API │ │  + Hotkey │ │
│  └───────────┘ └───────────┘ └───────────┘ │
└─────────────────────────────────────────────┘
```

## Copilot Integration

Flint authenticates via the same OAuth Device Flow used by tools like Goose, OpenCode, and Charm's Crush. Uses the shared Copilot client ID (`Iv1.b507a08c87ecfe98`) — no separate OAuth App registration needed.

1. User triggers sign-in → Flint POSTs to `https://github.com/login/device/code` with `client_id` and `scope=read:user`
2. User visits `github.com/login/device`, enters the user code
3. Flint polls `https://github.com/login/oauth/access_token` for the GitHub access token (handles `authorization_pending` and `slow_down` responses)
4. Flint exchanges the GitHub token for a Copilot token via `GET https://api.github.com/copilot_internal/v2/token`
5. The Copilot token response includes the chat completions endpoint (OpenAI-compatible format)
6. Tokens are stored in the OS keychain (`keyring` crate); the GitHub token is kept as a refresh token
7. Before expiration, Flint re-calls the Copilot token endpoint with the stored GitHub token

**Scope**: `read:user` — minimal permissions, read-only.

## Implementation Plan

### Phase 1 — Project Scaffolding
- Initialize Tauri v2 project using `create-tauri-app` with React + TypeScript + Vite template
- Set up directory structure (`src-tauri/` for Rust, `src/` for React)
- Configure `Cargo.toml` with required crates (`nucleo`, `keyring`, `reqwest`, `serde`, `serde_json`, `tokio`)
- Configure strict Clippy lints in `Cargo.toml` and add `rustfmt.toml`
- Configure ESLint (strict) + Prettier for frontend
- Install Zustand, Vitest, React Testing Library
- Verify the app builds and launches

### Phase 2 — Launcher Window & System Tray
- **System tray / menu bar icon** — persistent presence; tray menu with: Show Flint, Settings, Sign In / Sign Out, Quit
- **Settings UI** — accessed via tray menu; configure hotkey, indexed directories, exclude patterns, launch at login
- **Launch at login** — opt-in setting, implemented via platform autostart APIs
- **Launcher overlay** — borderless, floating, always-on-top, centered on active monitor
- Global hotkey `Cmd+Shift+Space` to toggle visibility (via `tauri-plugin-global-shortcut`)
- Click-away-to-dismiss (window blur event)
- Escape dismisses the window
- Subtle show/hide animation (fade + slight scale) for a modern feel
- Search input component (centered, minimal, large type)
- Results list component (keyboard-navigable: up/down/enter/escape)
- **Design direction**: Super modern, minimal, translucent/glassmorphism aesthetic. Rounded corners, soft shadows, smooth transitions.

### Phase 3a — Local File Search (Applications + Common Dirs)
- Rust-side parallel file walker (multi-threaded via `rayon` or `tokio::spawn_blocking` + `walkdir`)
- Initial scope: `~/Desktop`, `~/Documents`, `~/Downloads`, `/Applications` (macOS) / platform equivalents
- Configurable exclude patterns (`node_modules`, `.git`, `target`, `__pycache__`, hidden dirs)
- Fuzzy matching via `nucleo` crate (sub-millisecond on in-memory data)
- In-memory index of file paths + metadata for instant lookup
- Persist index to disk (bincode/MessagePack in app data dir) for fast cold start (~200ms cache load)
- Expose search over Tauri IPC
- Render results with file name, path, and type icon
- Enter opens the file with the system default application
- Progressive results — start returning matches as user types 2+ chars

### Phase 3b — Full System Search
- Expand scope to full `~` directory (in-memory index of ~1M files is ~50-100 MB, manageable)
- Incremental updates via OS filesystem events using `notify` crate:
  - macOS: FSEvents
  - Linux: inotify
  - Windows: ReadDirectoryChangesW
- Background re-indexing: load persisted cache on launch, validate freshness with FS events
- Opt-in broader scope (`/usr/local`, additional drives) via user settings
- Configurable max depth per scope

### Phase 4 — GitHub Copilot Authentication
- Implement the full device flow in Rust matching Charm/Crush's approach:
  - POST device code request with shared client ID `Iv1.b507a08c87ecfe98`
  - Poll for access token with backoff (`authorization_pending`, `slow_down`)
  - Exchange GitHub token for Copilot token via `/copilot_internal/v2/token`
- UI to display the user code and verification link
- Secure token storage via OS keychain (`keyring` crate)
- Store GitHub token as refresh token; Copilot token for API calls
- Automatic Copilot token refresh: background timer refreshes ~5 min before `expires_at` (~30 min TTL)
  - Retry with exponential backoff (1s, 2s, 4s...) on network failure
  - Queue outgoing API calls during refresh, swap token atomically (`Arc<RwLock<Token>>`)
  - If GitHub token itself is rejected (401/403), trigger re-authentication flow
- Auth status indicator in the launcher
- Handle errors: no Copilot subscription (403), network failures, expired codes

### Phase 5 — AI Chat
- Copilot chat completions client in Rust (streaming SSE via `reqwest` + `eventsource-stream`)
- AI chat panel in React with streaming markdown rendering (`react-markdown` + `rehype`)
- Simple conversational interface — send message, see streamed response
- Code blocks with syntax highlighting and copy-to-clipboard
- Conversation history management (in-memory, per-session for now; persistence deferred)

### Phase 6 — Logging & Observability
- Structured logging in Rust via `tracing` crate with `tracing-subscriber`
- Log levels: `error` and `warn` always on; `info`/`debug`/`trace` configurable
- Logs written to app data dir with daily rotation (`tracing-appender`)
- Frontend errors forwarded to Rust logger via IPC
- Performance instrumentation: window show time, search latency, chat first-token time

### Error UX
All phases share a consistent error presentation:
- **Transient errors** (network timeout, rate limit): Subtle toast notification at bottom of launcher, auto-dismiss after 5s, with retry action
- **Auth errors** (expired session, no subscription): Inline banner in launcher with "Sign in" / "Check subscription" action button
- **Indexing errors** (permission denied, disk full): Non-blocking — status indicator in tray icon tooltip; details in Settings
- **Chat errors** (stream interrupted): Inline in chat panel — "Something went wrong. Tap to retry." on the failed message

### Performance Budgets
| Metric | Target |
|--------|--------|
| Window show (hotkey → visible) | < 50ms |
| Search results per keystroke | < 10ms |
| Cold start (cache load → ready) | < 500ms |
| Chat first token | < 1s (network-dependent) |
| Index full `~` (initial scan) | < 10s |

### Future (out of scope for now)
- Model selection UI (Copilot endpoint supports GPT-4o, Claude, etc.)
- Rich chat: edit/resend messages, conversation persistence, export
- Natural language file search (AI interprets query → local search executes)
- Tool-use / agent loop (AI can call back into file search)
- Mode switching: `/ai` prefix or automatic intent detection
- Packaging, code signing, auto-update
- Application search (not just files)
