# OpenCode Integration — Replace Copilot with Second Brain Backend

## References

- **OpenCode SDK docs**: https://opencode.ai/docs/sdk/
- **OpenCode Server docs**: https://opencode.ai/docs/server/

## Summary

Replace the GitHub Copilot chat provider with an OpenCode backend. Flint will manage an OpenCode server process pointed at the user's "second brain" repo (a local GitHub repo of plain markdown files). The frontend chat UI stays the same shape but talks to OpenCode via its HTTP API + SSE event stream instead of Copilot's streaming completions. OpenCode owns its own model/auth configuration — Flint just manages the server lifecycle and proxies messages.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Server management | Flint spawns & owns the OpenCode process | User shouldn't manage a separate server |
| Config delegation | OpenCode owns model/auth config via `opencode.jsonc` in repo | Avoids duplicating provider config in Flint |
| Copilot provider | Removed entirely | Replaced by OpenCode |
| Second brain repo path | User-configurable in Flint settings | Different users, different repos |
| Communication | Rust backend → OpenCode HTTP API (reqwest) | Keep all I/O in Rust; frontend stays thin |
| Event streaming | Rust subscribes to OpenCode SSE, re-emits as Tauri events | Same pattern as current Copilot streaming |
| Session persistence | One long-lived OpenCode session per Flint launch | Simplest model; OpenCode persists sessions in SQLite |
| Kits | Kept as-is | Not the focus but no reason to remove |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React)                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ SearchBar│  │ ChatPanel│  │ Settings          │  │
│  └──────────┘  └────┬─────┘  │ • second_brain   │  │
│                     │IPC     │   repo path       │  │
│                     ▼        └──────────────────┘  │
├─────────────────────────────────────────────────────┤
│  Rust Backend                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ OpenCodeProvider (new)                       │   │
│  │ • spawn/kill opencode serve process          │   │
│  │ • health check on startup                    │   │
│  │ • create/reuse session                       │   │
│  │ • POST /session/{id}/message (send prompts)  │   │
│  │ • GET /global/event (SSE subscription)       │   │
│  │ • re-emit as Tauri events → frontend         │   │
│  └──────────────────────────┬───────────────────┘   │
│                             │ HTTP (localhost)       │
├─────────────────────────────┼───────────────────────┤
│  OpenCode Server Process    ▼                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ opencode serve --port <dynamic>              │   │
│  │ cwd = second_brain_repo_path                 │   │
│  │ owns: model config, auth, tools, sessions    │   │
│  └──────────────────────────────────────────────┘   │
│                             │                       │
│                             ▼                       │
│              ~/second-brain-repo/                    │
│              ├── opencode.jsonc (model config)       │
│              ├── notes/                              │
│              ├── projects/                           │
│              └── ...plain markdown files...          │
└─────────────────────────────────────────────────────┘
```

## Implementation

### Phase 1: Config — Add second brain repo path

**Files:** `src-tauri/src/config.rs`, `src/components/settings/`, `src/lib/commands.ts`

1. Add `SecondBrainConfig` struct to `config.rs`:
   ```rust
   pub struct SecondBrainConfig {
       /// Absolute path to the local second brain git repo.
       pub repo_path: Option<String>,
   }
   ```
2. Add `second_brain: SecondBrainConfig` field to `FlintConfig`.
3. Add a Settings UI section for configuring the repo path (directory picker or text input).
4. Validate path exists and is a directory on save.

### Phase 2: OpenCode server process management

**Files:** new `src-tauri/src/providers/opencode/process.rs`

1. Create `OpenCodeProcess` struct that manages the child process:
   - `start(repo_path: &Path, port: u16) → Result<Self>` — spawn `opencode serve --port {port} --hostname 127.0.0.1` with `cwd` set to the second brain repo.
   - `stop()` — kill the child process gracefully (SIGTERM, then SIGKILL after timeout).
   - `health_check()` — `GET /global/health` with retry loop (poll every 500ms, timeout after 10s).
   - `is_running()` — check process status.
2. Port selection: use a fixed port (e.g., 14096) or find a free port dynamically.
3. Handle process crashes: detect unexpected exit, log error, allow retry.
4. Lifecycle: start on app launch (if repo path configured), stop on app quit.

### Phase 3: OpenCode provider — session & messaging

**Files:** new `src-tauri/src/providers/opencode/mod.rs`, `session.rs`, `client.rs`

1. Create `OpenCodeClient` — thin HTTP wrapper using `reqwest`:
   - `health() → Result<bool>` — `GET /global/health`
   - `create_session(title: &str) → Result<Session>` — `POST /session`
   - `list_sessions() → Result<Vec<Session>>`
   - `send_message(session_id: &str, content: &str) → Result<MessageInfo>` — `POST /session/{id}/message`
   - `abort_session(session_id: &str) → Result<()>` — `POST /session/{id}/abort`
2. Create `OpenCodeProvider` — higher-level orchestrator:
   - Holds `OpenCodeProcess` + `OpenCodeClient` + current `session_id`.
   - `init(repo_path, app_handle)` — start process, wait for health, create or resume session.
   - `send_message(content, app_handle)` — send prompt, subscribe to events, re-emit.
   - `shutdown()` — abort active session, stop process.
3. Session strategy: on init, either create a new session or list existing and reuse the most recent non-archived one.

### Phase 4: SSE event bridge — OpenCode events → Tauri events

**Files:** `src-tauri/src/providers/opencode/events.rs`

1. Subscribe to `GET /global/event` (SSE stream) using `reqwest` + `eventsource` or manual SSE parsing (similar to current Copilot SSE parser).
2. Run the SSE listener in a background `tokio::spawn` task.
3. Map OpenCode events to Tauri events for the frontend:

   | OpenCode Event | Tauri Event | Payload |
   |----------------|-------------|---------|
   | `message.part.updated` (type: text, has delta) | `chat:token` | `delta` string |
   | `message.part.updated` (type: tool) | `chat:tool` | tool name + state |
   | `message.updated` (time.completed set) | `chat:done` | `()` |
   | `session.status` (type: idle) | `chat:done` | `()` (backup signal) |
   | `session.status` (type: busy) | `chat:streaming` | `()` |
   | error / disconnect | `chat:error` | error string |

4. The frontend's existing `useChat` hook already listens to `chat:token`, `chat:done`, `chat:error` — this is a drop-in replacement. Add `chat:tool` listener for tool call visibility.

### Phase 5: Replace Copilot commands with OpenCode commands

**Files:** `src-tauri/src/commands.rs`, `src/lib/commands.ts`

1. Remove Copilot-specific commands:
   - `start_copilot_auth` → remove
   - `complete_copilot_auth` → remove
   - `sign_out` → remove
2. Replace with OpenCode commands:
   - `send_chat_message(message: String)` — delegates to `OpenCodeProvider.send_message()`
   - `get_chat_status()` → `{ connected: bool, session_id: Option<String>, repo_path: Option<String> }`
   - `abort_chat()` — abort current OpenCode response
   - `clear_chat()` — create a new session
3. Keep `get_auth_status()` but repurpose: returns whether OpenCode is connected and has a valid session.
4. Update TypeScript command wrappers in `commands.ts`.

### Phase 6: Update frontend

**Files:** `src/stores/chatStore.ts`, `src/hooks/useChat.ts`, `src/components/ChatPanel.tsx`, `src/components/settings/ChatSettings.tsx`

1. **chatStore.ts**: Remove `isAuthenticating`, `authStatus` fields. Add `isConnected`, `sessionId`. Keep `messages`, `isStreaming`, `currentResponse`, `activeToolCalls`.
2. **useChat.ts**: Keep existing event listeners (`chat:token`, `chat:done`, `chat:error`). Add `chat:tool` listener. Remove auth-related logic.
3. **ChatPanel.tsx**: Remove Copilot auth prompt. Show connection status instead (connected to second brain, or "configure repo path in settings"). Show tool call activity from OpenCode (file edits, bash commands).
4. **ChatSettings.tsx**: Remove device flow UI. Replace with:
   - Second brain repo path (directory picker).
   - Connection status indicator (OpenCode server running / not running).
   - Button to restart OpenCode server.
   - Link/note about configuring models in `opencode.jsonc`.

### Phase 7: Remove Copilot provider

**Files:** `src-tauri/src/providers/copilot/` (entire directory)

1. Delete `src-tauri/src/providers/copilot/` (mod.rs, auth.rs, token.rs, credential_store.rs).
2. Remove `CopilotProviderState` from `lib.rs` setup.
3. Remove Copilot-related dependencies from `Cargo.toml` if any are Copilot-only.
4. Clean up any remaining references.

### Phase 8: App lifecycle integration

**Files:** `src-tauri/src/lib.rs`

1. In `setup()`:
   - Load config, check if `second_brain.repo_path` is set.
   - If set, initialize `OpenCodeProvider` (spawn server, health check, create session).
   - If not set, skip — provider stays uninitialized until configured.
   - Register `OpenCodeProviderState` as managed Tauri state.
2. On app quit: shut down OpenCode provider (stop process).
3. On config change (repo path updated): restart OpenCode provider with new path.

## Risks

- **OpenCode binary availability**: Flint assumes `opencode` is in `$PATH`. May need a first-run setup flow or bundling strategy later.
- **First-run DB migration**: OpenCode's first startup can be slow (SQLite migration). Need to handle this gracefully in the UI (loading state).
- **Port conflicts**: Fixed port could conflict. Dynamic port allocation adds complexity but is more robust.
- **Process cleanup**: If Flint crashes, the OpenCode process may orphan. Consider a PID file or process group management.

## Out of Scope

- Bundling the OpenCode binary with Flint.
- Configuring OpenCode's model/auth from within Flint's UI (OpenCode owns this).
- Second brain repo management (creating, syncing, git operations).
- "Capture from anywhere" accessibility feature (separate task).
- Changes to the kit system.
