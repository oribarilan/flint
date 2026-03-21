# Selecting a Session from the Sessions Kit

## Summary

Make session rows in the `Sessions` kit actionable so selecting a session does something useful (not just copy text). The target outcome is: from `s ` results, users can continue a chosen session in Flint and/or open that session in a terminal UI flow (Ghostty tab in your setup).

This task also captures current OpenCode platform constraints: there is no documented API to programmatically force an already-running TUI tab to jump to a specific session ID.

## High-Level Requirements

1. Selecting a session row must perform an intentional action (default Enter + explicit actions).
2. Keep overlay responsiveness intact (no blocking or heavy work on the overlay-ready path).
3. Support at least one concrete “open this session” workflow end-to-end.
4. If a capability is not possible in OpenCode (or only partially possible), surface clear fallback actions.
5. Keep behavior explicit for multi-server sessions (which server/session is being targeted).

## What Is Possible Today (OpenCode + Flint constraints)

1. **Resume by session ID via API is supported**
   - `POST /session/{id}/message` continues that exact session.
   - `GET /session/{id}/message` fetches history.
2. **Open in terminal TUI for a specific session is possible by spawning a new TUI process**
   - CLI supports `opencode attach <url> -s <sessionID>`.
3. **Focusing an existing already-open TUI tab/session is not currently supported via a direct API**
   - `/tui/open-sessions` opens picker UI but does not select a specific session ID.
4. **Current Flint sessions rows are passive**
   - `SessionsKit` currently returns copy-only actions for each session result.

## Definition of Done

- [ ] Session rows expose actionable operations (not just copy), with deterministic behavior.
- [ ] Enter key behavior for session rows is explicitly defined and implemented.
- [ ] Multi-server targeting is explicit (server + session identifier carried through action path).
- [ ] At least one of these workflows ships:
  - [ ] Continue selected session in Flint chat
  - [ ] Open selected session in Ghostty (new tab/process)
- [ ] Unsupported behavior (focus existing tab/session) is documented in UI copy/task notes.
- [ ] Unit tests + simulator tests cover the chosen action paths and fallbacks.

## Testing Plan

1. **Rust unit tests**
   - Action ID parsing/validation for session actions (`server_id`, `session_id`).
   - Guardrails for malformed IDs and unknown servers.
2. **Frontend unit tests (Vitest/RTL)**
   - Session action rendering and trigger behavior.
   - Correct command invocation per selected action.
3. **Simulator / Playwright**
   - Selecting a session triggers expected action path.
   - Failure path produces deterministic user-facing feedback.
4. **Manual validation (macOS)**
   - Ghostty integration path opens expected session (new tab/process).

## Alternatives Considered

### A) Continue in Flint only

- Pros: cleanest UX, least context switch, API-native.
- Cons: ambiguous for sessions from non-primary servers unless Flint can bind to that server/session robustly.

### B) Open in Ghostty only (`opencode attach ... -s ...`)

- Pros: closest to “open the session window/tab” mental model.
- Cons: opens a **new** TUI process/tab; cannot force-focus an existing tab/session.

### C) Hybrid action model (**recommended**)

- Primary: Continue in Flint (when server/session is compatible).
- Secondary: Open in Ghostty (spawn attach command).
- Fallback: Copy attach command / copy session ID.
- Pros: best coverage and clear escape hatch.
- Cons: more implementation surface.

## Recommended Approach

### Phase 1 — Actionable sessions + deterministic defaults

1. Add session-specific actions in `SessionsKit` (e.g., custom actions carrying server/session IDs).
2. Define Enter behavior:
   - Recommended default: **Continue in Flint** when possible.
   - Otherwise fallback to **Open in Ghostty** or **Copy attach command** (based on user preference/config).
3. Add clear action labels so users understand whether action stays in Flint or launches terminal.

### Phase 2 — Continue in Flint session selection path

1. Add backend command/path to select an arbitrary session ID for chat continuation.
2. Ensure history is loaded for the chosen session before user sends next message.
3. Handle mismatch cases (session belongs to a different monitored server than Flint’s active provider).

### Phase 3 — Ghostty launch path

1. Build attach command from result metadata:
   - `opencode attach http://<host>:<port> -s <session_id>`
2. Execute via shell/terminal launch strategy compatible with macOS + Ghostty.
3. On failure, show actionable fallback (copy command, copy ID).

## Implementation Sketch

1. `src-tauri/src/kits/sessions.rs`
   - Add additional actions per session row (custom + copy helpers).
   - Add kit-side handler logic (or frontend-routed command) for selected action.
2. `src/components/ResultsList.tsx` + session action plumbing
   - Route session actions cleanly and preserve hide-window semantics where appropriate.
3. `src-tauri/src/providers/opencode/mod.rs` + command layer
   - Add explicit “select session” API for Flint chat continuation.
4. Optional config/UI
   - Add preferred default action for session selection (`continue_in_flint` vs `open_in_terminal`).

## Progress / Notes

- OpenCode capability research done:
  - Session selection by ID via REST is supported.
  - `opencode attach ... -s ...` is available and suitable for new terminal tab/process flow.
  - No direct documented API for selecting a specific session in an already-open TUI tab.

## Open Questions for User

1. What should **Enter** on a session row do by default?
   - `Continue in Flint` (recommended)
   - `Open in Ghostty`
2. For sessions on servers other than Flint’s primary chat server, do you want:
   - Attempt “Continue in Flint” by connecting to that server/session, or
   - Always launch Ghostty attach flow?
3. Should Flint auto-hide when opening Ghostty, or keep Flint visible until attach succeeds?
4. Do you want a visible secondary action for “Copy attach command” in the action panel?
