# US-new-session

## Goal

Let the user start a fresh conversation with `Cmd+N`. This destroys the current Copilot session (so the LLM has no prior context), clears all renderer-side chat state, and shows a `⌘N` hint in the bottom bar for discoverability.

## Definition of Done

- [ ] `Cmd+N` creates a brand-new Copilot session with no history — the next message goes to a fresh session, not the old one
- [ ] Chat messages, streaming state, and attention selection are cleared in the renderer
- [ ] Bottom bar shows a `⌘N new chat` hint
- [ ] Unit tests cover the reset IPC handler, the renderer hotkey, and the bottom bar hint
- [ ] `just check` passes

## Task Priority

1. `session-reset-backend.md` — IPC plumbing: channel, main process handler, preload bridge. No UI dependency; provides the reset capability all other code builds on.
2. `new-session-hotkey.md` — Wires `Cmd+N` in the renderer, calls the reset bridge, clears stores, adds the bottom bar hint. Depends on the backend channel existing.

## Cross-Cutting Concerns

- **Session teardown order**: Abort any in-flight request (`session.abort()`) before destroying. Set `chatSession = null` so the next `chat:send` lazily creates a fresh one — this reuses the existing lazy-creation pattern in `src/main/index.ts`.
- **No `client.deleteSession()`**: The current code doesn't pass a `sessionId` to `createSession`, so SDK-generated IDs aren't tracked. Nulling the reference and letting GC clean up is sufficient.
- **Streaming guard**: If a response is actively streaming when the user hits `Cmd+N`, abort first, then reset. The renderer should show the cleared state immediately — don't wait for the abort to resolve.
- **Attention items**: Clearing attention selection on reset is optional (attention items are meeting-driven, not chat-driven). Clear the *selection* but keep the items.
- **Bottom bar hint placement**: Add `⌘N new chat` to the left of the existing navigation hints, separated by `·`. Uses the same `HotkeyHint` component pattern from US-keyboard-nav.
