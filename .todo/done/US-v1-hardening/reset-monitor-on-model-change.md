# reset-monitor-on-model-change

## Context

`SessionManager.getMonitorSession()` (`src/main/copilot/sessions.ts:73-90`) caches the monitor session for the lifetime of the app:

```ts
async function getMonitorSession(): Promise<CopilotSession> {
  if (monitorSession) return monitorSession;
  // ... creates with config.getPollModel() at creation time
}
```

Once created, the session uses whatever `pollModel` was set at first creation. If the user changes the poll model in Settings, the change has no effect until app restart.

Same latent bug existed for chat until `resetChat` was added (`sessions.ts:122-132`). There is no equivalent `resetMonitor`.

The chat model also has a subtler version of this bug: `config.getModel()` is read once at session creation. If the user changes the chat model, they must also `Cmd+N` (which calls `resetChat`) to apply it — but this isn't obvious.

**Value delivered**: Settings changes actually take effect without restart. Eliminates a class of "I changed the model but nothing happened" bug reports.

## Related Files

- `src/main/copilot/sessions.ts:73-90, :122-132` — `getMonitorSession`, `resetChat`
- `src/main/ipc/model-handlers.ts` — model change IPC
- `src/main/ipc/handlers.ts:27-29` — `config:set` handler
- `src/main/config.ts:68-74` — config update
- `src/renderer/src/components/Settings.tsx:208-215` — poll model picker

## Dependencies

- `decide-v1-mission-scope.md` — if pull-only V1, this task may be irrelevant (no monitor session). Defer until scope decision lands.

## Acceptance Criteria

- [ ] `SessionManager` interface gains `resetMonitor(): Promise<void>` mirroring `resetChat`
- [ ] Implementation: aborts current request if any, sets `monitorSession = null`. Next `sendMonitorPoll` call creates a fresh session with the current `getPollModel()`.
- [ ] `config:set` IPC handler in `src/main/ipc/handlers.ts` (or wherever appropriate): when the partial includes `pollModel`, calls `sessionManager.resetMonitor()`. When it includes `model`, calls `sessionManager.resetChat()` (currently NOT done — same latent bug).
- [ ] Optionally trigger an immediate poll after `resetMonitor` (via `pulseScheduler.pollNow()`) so the new model is exercised right away
- [ ] Unit tests in `src/main/__tests__/copilot-sessions.test.ts`:
  - `resetMonitor` clears cached session
  - Next `sendMonitorPoll` after reset uses the updated model
  - Aborts in-flight requests safely
- [ ] Integration test: change `pollModel` via config update → confirm next session uses the new model (mock the SDK to capture `createSession` arguments)
- [ ] UI feedback: when model changes via Settings, briefly show a "applying…" indicator OR rely on connection dot reconnecting state

## Verification

**Automated (required):** unit and integration tests above.

**Ad-hoc:** in dev mode, change the chat model in Settings, send a chat message immediately. Confirm the new model is used (visible in `[sessions]` log line: `Creating chat session with model: ...`). Same for poll model.

## Notes

- This is a small but important correctness task. The bug is silent and counterintuitive — changing settings should always do something visible.
- Coordinate with `surface-connection-status.md` — when `resetMonitor` runs, briefly show "reconnecting" state in the dot.
- Consider extracting the "config-change → session-reset" mapping into an explicit table to avoid forgetting future fields. E.g., `MODEL_FIELDS_REQUIRING_RESET = { model: "chat", pollModel: "monitor" }`.
- If pull-only V1 (no monitor), this task collapses to "make sure chat model change triggers `resetChat`" — still worth doing.
