# wire-meeting-scheduler-data-source

## Context

The deterministic `MeetingScheduler` (alert window logic, dedupe, 60s tick, 15-min poll, start/stop) is fully implemented, wired in `src/main/index.ts`, and tested. However its data source is currently a stub: `fetchUpcomingMeetings()` in `src/main/index.ts:64` returns `[]`. As a result, **no meeting alerts will ever fire in production**, even though every other piece of the alert pipeline works.

This was an explicit time-box during `US-v1-hardening` and is documented in that story's Open Items section. Wiring this is the last step before pull-only V1 actually delivers its headline feature (timely meeting alerts) on real M365 data.

**Value delivered**: Real users with `workiq accept-eula` complete will receive native OS notifications for upcoming meetings within their configured alert window. The feature promised by V1 actually works end-to-end.

## Related Files

- `src/main/index.ts:54-66` — current stub with TODO comment
- `src/main/index.ts:232-237` — scheduler wiring (already correct; only the data source changes)
- `src/main/scheduler/meeting-scheduler.ts` — deterministic logic (no changes expected)
- `src/main/scheduler/__tests__/meeting-scheduler.test.ts` — existing tests for the scheduler core
- `src/main/types.ts` — `Meeting` type the data source must produce
- `docs/superpowers/specs/2026-04-30-v1-scope-decision.md` — context for why this was deferred

## Dependencies

None. `US-v1-hardening` landed this stub knowingly; this task replaces it.

## Acceptance Criteria

- [ ] A decision is documented (in this file or as a code comment) on which data-source approach is taken:
  - **Option A (recommended in v1-hardening main.md):** invoke `npx workiq ask "list my meetings ..." --json` via `execFile`, parse the JSON, map to `Meeting[]`
  - **Option B:** spawn a separate `workiq mcp` subprocess and speak MCP to it from the main process
- [ ] `fetchUpcomingMeetings()` is replaced with a real implementation in `src/main/index.ts` (or extracted into `src/main/scheduler/work-iq-meeting-source.ts` if it grows past ~50 LOC)
- [ ] The function returns within a reasonable timeout (≤10s); on timeout or error it logs and returns `[]` (graceful degradation — never crashes the scheduler)
- [ ] The 15-minute poll cadence in `MeetingScheduler` continues to drive this function; per-tick alert logic is unchanged
- [ ] Unit tests cover: successful parse, empty result, malformed JSON, CLI failure (non-zero exit), timeout
- [ ] Returned `Meeting[]` validates against a zod schema before reaching the scheduler (consistent with `US-v1-hardening` trust-boundary policy — treat CLI output as untrusted)
- [ ] Manual end-to-end test: with a real Work IQ-authenticated machine, the next genuine calendar meeting fires an OS notification at the configured alert offset
- [ ] All existing tests still pass (`just check`)

## Verification

**Automated (required):**
- New test file: `src/main/scheduler/__tests__/work-iq-meeting-source.test.ts` (or inline in `meeting-scheduler.test.ts` if implementation stays in `index.ts` — preference: extract).
- Mock `execFile` (or whatever boundary is chosen) to assert: parsing happy path, parsing error, exit-code error, timeout, schema-rejection.

**Ad-hoc:**
- Set `alertMinutes` in config to a value that brackets a real upcoming meeting.
- Run `just dev`, complete `workiq accept-eula` if needed, wait for the next 15-min poll (or temporarily lower the poll interval for testing).
- Confirm a native notification appears at the expected lead time, and that clicking it routes through the existing notification handler (whatever that flow is — notification-click handling is out of scope).
- Confirm no notification fires twice for the same meeting (dedupe is already in `MeetingScheduler`; this just verifies the data source doesn't re-emit duplicates).

## Notes

- **Schema validation is non-negotiable.** The CLI is an external process whose output shape can change between Work IQ versions. Validate at the boundary; reject malformed entries individually rather than failing the whole tick.
- **Don't reintroduce LLM-driven monitoring.** This is pure deterministic data fetching. The whole point of pull-only V1 is that the LLM is not in the alert loop.
- **Performance.** This runs every 15 minutes; CLI cold-start cost (~1-3s) is acceptable. Don't optimize prematurely.
- **Auth failure UX.** If the CLI returns "not authenticated" or similar, surface a one-time setup hint to the user (similar pattern to the chat-error MCP setup hint added in `wire-real-work-iq`). Mechanism TBD — could reuse the connection-status pipeline or add a new one-shot toast IPC. Capture the design choice in a code comment.
- This task should keep `src/main/index.ts` under its current LOC ceiling — extract to `src/main/scheduler/work-iq-meeting-source.ts` if needed.
