# session-reset-backend

## Context

There is no way to reset the chat session today. `chatSession` in `src/main/index.ts` is created lazily on first `chat:send` and persists for the app's lifetime. To support "new session", we need an IPC channel that aborts any in-flight request, destroys the session reference, and signals readiness so the next `chat:send` creates a fresh one.

**Value delivered**: Any code path (hotkey, menu, future API) can programmatically reset the chat session. The renderer already has `clearMessages()` in the chat store — this task provides the backend half.

## Related Files

- `src/main/ipc/channels.ts` — add `CHAT_RESET` channel constant
- `src/main/index.ts` — add `ipcMain.handle` for reset (abort + null `chatSession`)
- `src/preload/index.ts` — expose `chatReset()` on `window.flint`
- `src/renderer/src/lib/ipc.ts` — add `chatReset()` to `FlintAPI` interface

## Dependencies

- None

## Acceptance Criteria

- [ ] `IPC_CHANNELS.CHAT_RESET` exists with value `'chat:reset'`
- [ ] Main process handler: if `chatSession` is not null, calls `chatSession.abort()` (catching errors — session may not be active), then sets `chatSession = null`
- [ ] Main process handler: if `chatSession` is already null, no-op (idempotent)
- [ ] `window.flint.chatReset()` is exposed via the preload bridge as an invoke (returns `Promise<void>`)
- [ ] `FlintAPI` type in `src/renderer/src/lib/ipc.ts` includes `chatReset(): Promise<void>`
- [ ] Handler logs `[ipc] chat session reset` on successful reset
- [ ] Unit test: calling reset when session exists aborts and nulls it
- [ ] Unit test: calling reset when session is null does not throw
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests for the reset handler (mock `chatSession.abort()`, verify null after reset, verify idempotent when already null)
- **Ad-hoc**: `just check` passes

## Notes

The reset handler uses `ipcMain.handle` (not `ipcMain.on`) so the renderer can `await` completion before clearing local state. This ensures the backend session is destroyed before the next `chat:send` would create a new one.
