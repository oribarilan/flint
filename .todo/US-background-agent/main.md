# US-background-agent

## Goal

Flint runs a background process ("Pulse") that periodically queries M365 via Work IQ to surface important calendar events, emails, and Teams messages. The LLM decides what matters, updates the attention panel, and optionally sends native notifications. The same attention data feeds contextual suggestion cards in the chat empty state.

## Definition of Done

- [ ] Background polling runs on an adaptive schedule (work hours vs off-hours) with user-configurable frequency
- [ ] Polling can be enabled/disabled and uses a separate model from chat
- [ ] Bootstrap poll fires immediately on app start; subsequent polls are delta-scoped
- [ ] Polling pauses while overlay is focused, resumes on blur
- [ ] Polls gracefully handle failures, disconnection, missing auth, and system sleep/wake
- [ ] Contextual suggestions in the chat empty state derive from attention items, capped at 3-4 cards
- [ ] `index.ts` uses `CopilotManager` and `SessionManager` instead of inline wiring
- [ ] Dead code removed: `MeetingMonitor`, `MeetingCache`, `report_meetings` tool
- [ ] `ask_work_iq` mock fixed and extended for email/Teams
- [ ] `just check` passes

## Task Priority

1. `refactor-main-wiring.md` — Foundation: wire CopilotManager/SessionManager, remove dead code
2. `fix-workiq-mock.md` — Fix date bug, extend mock for email/Teams (needed for testing Pulse)
3. `config-background-agent.md` — New config fields + electron-store migration (can parallel with task 2)
4. `monitor-session.md` — Monitor prompts, tool partitioning, sendMonitorPoll signature (owns prompts.ts)
5. `pulse-scheduler.md` — Core scheduler with adaptive intervals, power management, overlay freeze (calls sendMonitorPoll from task 4)
6. `contextual-suggestions.md` — buildSuggestions + ChatEmptyState integration

## Cross-Cutting Concerns

- **Performance**: The overlay-ready critical path must not be affected. Contextual suggestions read from the in-memory attention store — no IPC, no network, no disk I/O.
- **Error resilience**: Background poll failures are silent. Current attention items stay unchanged. No error UI for background failures.
- **Tool callback wiring**: The `set_attention_items` tool callback handles both writing to `AttentionStore` and sending `attention:update` IPC. Same pattern as current inline implementation.
- **Spec**: `docs/superpowers/specs/2026-04-25-background-intelligence-design.md`
