# Sprint04-5: Simulator and E2E Coverage for Session Monitoring

## Summary

Add simulator mock behavior and Playwright coverage for the new multi-server session-monitor feature. This ticket validates both functional behavior and user-facing flow for kit activation, status rendering, and update dynamics.

## High-Level Requirements

- Extend simulator mocks to represent multiple monitored servers and session statuses.
- Support synthetic status transitions (idle ↔ working ↔ waiting/error) for deterministic tests.
- Add end-to-end tests for Sessions kit activation, results, and update behavior.
- Include settings-based server configuration flow in test coverage.

## Definition of Done

- [x] Simulator exposes deterministic monitor state fixtures for 2+ servers.
- [x] Simulator can emit status updates while UI is open.
- [x] Playwright tests cover:
  - command activation (`sessions`/prefix flow)
  - rendering sessions from multiple servers
  - status updates reflected in UI
  - empty/error states
  - settings add/remove server flow
- [x] Tests are stable (no flaky timing assumptions) and run in CI baseline.

## Testing Plan

- Run targeted simulator + E2E suite during implementation.
- Run full E2E at completion:

```bash
just sim
just test-e2e
```

- Re-run full validation after merge-ready state:

```bash
just check
```

## Alternatives Considered

1. Unit-test only for v1.
   - Pros: faster initial implementation.
   - Cons: misses integration risks in command routing + settings + event updates.

2. Manual QA only.
   - Pros: no test-writing overhead.
   - Cons: no regression protection.

## Recommended Approach

Use deterministic simulator fixtures plus Playwright assertions for lifecycle flows. This provides repeatable confidence and protects future sprint refactors.

## Implementation

1. Extend simulator Tauri mocks and state model for monitored servers/sessions.
2. Add helper utilities to emit monitor status updates on demand.
3. Create Playwright specs for Sessions kit happy path and edge states.
4. Add settings-path test for server add/remove and persisted effect.
5. Stabilize timing with explicit waits on UI state/events rather than arbitrary sleeps.

## Progress / Notes

- Depends on tickets 3–4.
- This ticket is a release-confidence gate for Sprint 04.

### Completed

- **`simulator/types.ts`**: Added monitored-server simulation types (`MonitoredServerState`, `MonitorSession`, status union) and included them in `SimState`.

- **`simulator/mock-tauri.ts`**:
  - Added deterministic monitored-server fixtures in test mode (2 servers, mixed statuses).
  - Added `__sim.setMonitoredServers(...)` helper for replacing monitor fixtures.
  - Added `__sim.setSessionStatus(serverId, sessionId, status)` helper that emits `monitor:session_update`.
  - Synced fixture state into `config.monitored_servers` for settings round-trip realism.

- **`simulator/mock-platform.ts`**:
  - Added `monitored_servers` to simulator default config.
  - Added Sessions kit manifest in `get_kit_manifests` with effective prefix `"s "`.
  - Implemented `search_command` path for `kitId === "sessions"` returning deterministic session results with status badge accessories.

- **E2E specs**:
  - `simulator/tests/smoke.spec.ts`:
    - Added test: Sessions prefix activates sessions command and returns monitor results.
    - Added test: monitor status update path reflected in sessions results.
  - `simulator/tests/settings.spec.ts`:
    - Added test: add and remove monitored server from Agent settings.

- **Validation**:
  - `just test-e2e` ✅ (33 passed)
  - `just check` ✅
