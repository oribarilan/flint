# monitor-session

## Context

The monitor session needs a system prompt, updated tool partitioning, and prompt builders for bootstrap vs delta polls. The `sendMonitorPoll` signature needs updating to accept poll context.

**Value delivered**: The monitor session is properly configured to act as a background intelligence agent.

## Related Files

- `src/main/copilot/sessions.ts` — session config, sendMonitorPoll signature
- `src/main/pulse/prompts.ts` — bootstrap + delta prompt builders (this task owns this module)
- `src/main/copilot/tools.ts` — monitor tool set (ask_work_iq, set_attention_items, show_notification)

## Dependencies

- `refactor-main-wiring.md` (tool partitioning changed there)
- `config-background-agent.md` (monitor session uses `pollModel` from config)

## Acceptance Criteria

- [ ] Monitor session has dedicated system prompt (background monitor guidelines, tool descriptions, notification criteria, item count guidance)
- [ ] `sendMonitorPoll(context)` accepts `{ lastPollTime?: string; currentItems: AttentionItem[] }`
- [ ] `sendMonitorPoll(context)` builds bootstrap prompt when `lastPollTime` is undefined
- [ ] `sendMonitorPoll(context)` builds delta prompt with timestamp + serialized items when `lastPollTime` is provided
- [ ] Prompt builder is a pure function in `src/main/pulse/prompts.ts`, unit-testable in isolation
- [ ] Monitor session timeout remains 90s
- [ ] Monitor session uses `pollModel` from config
- [ ] Monitor errors are logged but never surfaced to user
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests for prompt builder — bootstrap (no timestamp/items), delta (with timestamp + items), empty items edge case
- **Ad-hoc**: `just check` passes; observe monitor session prompts in dev mode logs
