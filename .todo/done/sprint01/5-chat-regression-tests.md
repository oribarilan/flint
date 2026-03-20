# Sprint01-5: Chat Regression Tests (Focused E2E + Cross-Ticket Gaps)

## Summary

This ticket locks in sprint behavior with targeted regression tests for highest-risk cross-ticket chat flows. Coverage is intentionally focused: Escape session reset, delta-send + hydration behavior, required model/default behavior, and settings restart/failure states. Goal is fast, stable guardrails without expanding into unrelated E2E stabilization.

## Requirements

- Add focused Playwright simulator tests for critical user journeys.
- Add only cross-ticket unit tests that are still missing after tickets 1-4.
- Keep tests deterministic and isolated from unrelated global smoke failures.

## Implementation

### Scope

1. Add focused simulator E2E spec(s) for critical chat flows.
2. Ensure test fixtures/mocks include disconnected/reconnect and project-default model states.
3. Add only cross-ticket unit-test gaps discovered after tickets 1-4.

### Proposed Test Matrix

- **Cross-ticket unit tests (only if gaps remain)**
  - Delta-send contract remains message-only after full flow integration.
  - Rehydration trigger coverage across clear/reconnect boundaries.

- **Focused E2E**
  - Agent mode: send → wait indicator → stream visible.
  - Escape clears chat and starts fresh session behavior.
  - Required project model flow stays enforced until default is set.
  - Simulated disconnect → retry/reconnect succeeds.

### Related Files

- `src/hooks/__tests__/useKeybindings.test.ts`
- `src/components/__tests__/ChatPanel*.test.tsx`
- `src/lib/__tests__/commands.test.ts`
- `src/stores/__tests__/chatStore.test.ts`
- `simulator/tests/` (new focused chat spec)
- `simulator/mock-tauri.ts`
- `simulator/mock-opencode.ts` (**already exists** at 210 lines — extend rather than create)

## Simulator Mock Gaps to Address Before Writing E2E Tests

- **`has_model=true` blocks required-model-picker path:** `mock-tauri.ts:67` always returns `has_model: true`. The "Required project model" E2E test in the matrix can never exercise the required-model-picker path unless this is overrideable. Add a `__sim.setHasModel(false)` control (similar to `setConnected`) to enable testing the unpicked-model flow.
- **`init_opencode` overwrites `setConnected(false)`:** `mock-opencode.ts:202–208` always sets `connected: true` when `init_opencode` is called, so `__sim.setConnected(false)` cannot simulate a persistent disconnect for the disconnect→retry→reconnect E2E test. Add a mock option to suppress or override the auto-reconnect so disconnect states can be held for test assertions.

## Acceptance Criteria

- [ ] At least one focused E2E spec covers each critical flow in matrix.
- [ ] New tests pass locally without relying on unrelated smoke fixes.
- [ ] Test naming and assertions are explicit and non-flaky.
- [ ] Any cross-ticket unit-test gaps (if found) are filled without duplicating ticket 1-4 unit work.

## Notes

- Tickets 1-4 are responsible for their own unit tests. This ticket focuses on cross-ticket regression closure and focused E2E coverage.

## Verification

- `just test-frontend`
- Focused Playwright command for new chat spec(s)

## Risks

- Simulator mock drift causing brittle E2E tests.
- Overlapping assertions with existing smoke tests causing redundancy.

## Out of Scope

- Full simulator suite re-architecture.
- Unrelated frontend component coverage backlog beyond sprint01 scope.
