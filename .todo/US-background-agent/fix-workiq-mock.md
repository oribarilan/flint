# fix-workiq-mock

## Context

The `ask_work_iq` tool in `tools.ts` is a mock with a date mutation bug (`today.setHours()` cascading) and only covers calendar data. The Pulse scheduler needs email and Teams message coverage for development and testing.

**Value delivered**: Working mock that covers all three data sources. Enables Pulse development and testing without real M365 credentials.

## Related Files

- `src/main/copilot/tools.ts` — `ask_work_iq` mock implementation (~lines 44-140)
- `src/main/__tests__/` — tests for the mock

## Dependencies

- `refactor-main-wiring.md` (tool file is modified in both; do this second to avoid conflicts)

## Acceptance Criteria

- [ ] Date mutation bug fixed — mock meetings have correct, non-cascading times
- [ ] Email mock: returns realistic unread emails when query contains `email|mail|inbox`
- [ ] Teams mock: returns realistic Teams messages when query contains `teams|message|chat|channel`
- [ ] Time-scoped queries work: "emails since 10:30" returns a subset (simulated)
- [ ] Mock data is realistic (real-sounding names, subjects, timestamps relative to now)
- [ ] Unit tests cover all three keyword routes and time-scoped queries
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests for mock routing and time-scoped filtering
- **Ad-hoc**: `just check` passes
