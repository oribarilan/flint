# new-session-hotkey

## Context

With the backend reset channel in place, the renderer needs to wire `Cmd+N` to trigger it, clear local state, and show a discoverable hint in the bottom bar.

**Value delivered**: Users can start a fresh conversation instantly with `Cmd+N`. The bottom bar hint makes this discoverable without documentation.

## Related Files

- `src/renderer/src/App.tsx` — keydown handler + bottom bar footer
- `src/renderer/src/App.module.css` — bottom bar styles (if layout adjustment needed)
- `src/renderer/src/stores/chatStore.ts` — `clearMessages()` action
- `src/renderer/src/hooks/useChat.ts` — `clearMessages` re-export
- `src/renderer/src/components/HotkeyHint.tsx` — reusable hint component (if it exists from US-keyboard-nav, otherwise use plain text with modifier symbol)

## Dependencies

- `session-reset-backend.md` — the `window.flint.chatReset()` bridge must exist

## Acceptance Criteria

- [ ] `Cmd+N` (macOS) triggers a new session: calls `window.flint.chatReset()`, then clears chat messages and streaming state via the chat store
- [ ] If a response is actively streaming when `Cmd+N` is pressed, the stream is aborted and UI clears immediately (no stale partial content)
- [ ] After `Cmd+N`, the chat panel shows the empty state (same as app launch)
- [ ] Attention item *selection* is cleared; attention *items* themselves are preserved
- [ ] The chat input is focused after reset
- [ ] Bottom bar shows `⌘N new chat` hint (using `HotkeyHint` component if available, otherwise a styled `<span>`)
- [ ] The hint appears to the left of existing navigation hints, separated by `·`
- [ ] `Cmd+N` is suppressed (no browser default "new window" behavior via `e.preventDefault()`)
- [ ] Unit test: pressing `Cmd+N` calls `chatReset` and `clearMessages`
- [ ] Unit test: bottom bar renders the `⌘N` hint text
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests for the hotkey handler and bottom bar hint rendering
- **Ad-hoc**: `just check` passes. Manual test in dev mode — `Cmd+N` clears chat, shows empty state, input is focused, bottom bar shows hint.

## Notes

The keydown handler goes in App.tsx's existing `useEffect` for keyboard events. Check for `e.metaKey && e.key === 'n'` (macOS). The reset is fire-and-forget from the UI perspective — call `chatReset()` without awaiting, then immediately clear local state for instant feel. The backend abort happens asynchronously.
