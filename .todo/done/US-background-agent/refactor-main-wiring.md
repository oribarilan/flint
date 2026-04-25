# refactor-main-wiring

## Context

`index.ts` bypasses `CopilotManager` and `SessionManager`, wiring CopilotClient, chat session, IPC handlers, and tools inline. This makes it impossible to add the monitor session cleanly. The refactor switches to using the existing (but unused) module abstractions.

**Value delivered**: Clean main process architecture. CopilotManager/SessionManager are the single source of truth for Copilot lifecycle. Dead code removed. Foundation for all subsequent tasks.

## Related Files

- `src/main/index.ts` — refactor target (146 lines)
- `src/main/copilot/client.ts` — CopilotManager (unused, needs cliPath param)
- `src/main/copilot/sessions.ts` — SessionManager (unused, needs system prompt + model config)
- `src/main/copilot/tools.ts` — remove `report_meetings`, update monitor tool set
- `src/main/meetings/monitor.ts` — remove
- `src/main/meetings/cache.ts` — remove
- `src/main/ipc/handlers.ts` — consolidate chat:send handler

## Dependencies

- None (first task)

## Acceptance Criteria

- [ ] `index.ts` creates `CopilotManager` (with configurable cliPath) and `SessionManager` instead of inline `CopilotClient`/session
- [ ] cliPath resolution: `COPILOT_CLI_PATH` env var → `which copilot` PATH lookup → `/opt/homebrew/bin/copilot` macOS fallback
- [ ] The rich system message from `index.ts` is moved into `SessionManager` as the canonical chat prompt
- [ ] `SessionManager` reads model from user config instead of hardcoding `gpt-4.1`
- [ ] `chat:send` handler uses `SessionManager.sendChatMessage()` instead of inline session management
- [ ] `report_meetings` tool removed from `tools.ts`
- [ ] `getMonitorTools()` returns `ask_work_iq`, `set_attention_items`, `show_notification`
- [ ] `MeetingMonitor` (`src/main/meetings/monitor.ts`) deleted
- [ ] `MeetingCache` (`src/main/meetings/cache.ts`) deleted
- [ ] `connection:status` IPC is wired (sent on CopilotManager status changes)
- [ ] Graceful shutdown uses force-stop timeout fallback per SDK best practices
- [ ] Existing chat flow (`chat:send` → `chat:delta` → `chat:done`) works end-to-end
- [ ] `attention:update` IPC still fires when `set_attention_items` tool is called
- [ ] `just check` passes

## Verification

- **Automated**: Integration test verifying chat:send → delta → done flow works after refactor
- **Ad-hoc**: `just check` passes; manual chat test in dev mode
