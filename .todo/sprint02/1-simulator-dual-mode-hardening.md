# Sprint02-1: Simulator Dual-Mode Hardening (Dev Real Proxy + Test Deterministic Mocks)

## Summary

The simulator is now a core development and verification surface. This ticket hardens its dual-mode contract so `sim` (dev) consistently proxies to a real OpenCode backend, while `sim:test` remains deterministic for automation. The main objective is predictable behavior, clean SSE lifecycle handling, and explicit mode semantics.

## Requirements

- Preserve strict separation:
  - `npm run sim` (dev mode) → real OpenCode HTTP/SSE proxy.
  - `npm run sim:test` (test mode) → fully mocked deterministic handlers.
- Keep platform APIs mocked in both modes.
- Ensure SSE bridge does not produce duplicate token streams.
- Provide clear failure UX/logs when OpenCode is not reachable in dev mode.

## Implementation

### Scope

1. Validate and harden mode routing in `simulator/mock-tauri.ts`.
2. Harden SSE lifecycle in `simulator/opencode-proxy.ts` (single active bridge, reconnect policy, teardown).
3. Ensure test-mode override hooks remain deterministic and isolated per run.
4. Document simulator mode behavior and env requirements in task notes/docs.

### Current State Notes

- `simulator/mock-tauri.ts` already uses `import.meta.env.MODE === "test"` as the mode switch.
- `simulator/opencode-proxy.ts` already calls `stopSSEBridge()` before reconnecting.
- Primary remaining risk is regression of these guarantees; lock them with targeted tests and explicit docs.

### Proposed Changes

- **Mode contract hardening**
  - Keep `import.meta.env.MODE === "test"` as single source for simulator mode.
  - Ensure command routing merges `platformHandlers` + mode-appropriate OpenCode handlers only once.

- **SSE lifecycle**
  - Confirm `startSSEBridge()` always calls `stopSSEBridge()` before opening a new stream.
  - Guard against multiple `init_opencode` calls creating parallel stream loops (idempotent bridge start).
  - Keep reconnect backoff bounded and dev-only log noise minimal.

- **Error handling**
  - In dev mode, when `/global/health` fails, return clear disconnected status and avoid partial initialized state.
  - Avoid throwing uncaught errors from auto-init path.

- **Test-mode determinism**
  - Retain `window.__sim` override controls (`setConnected`, `setAutoReconnectOnInit`, `setHasModel`, `setRepoPath`).
  - Keep override persistence isolated to simulator session storage in test mode only.

### Related Files

- `simulator/mock-tauri.ts`
- `simulator/opencode-proxy.ts`
- `simulator/mock-opencode.ts`
- `vite.config.simulator.ts`
- `package.json`
- `simulator/tests/smoke.spec.ts`
- `CONTRIBUTE.md`

## Acceptance Criteria

- [x] `npm run sim` uses real proxy handlers; `npm run sim:test` uses deterministic mock handlers.
- [x] Repeated `init_opencode` calls do not create duplicate SSE streams/listeners.
- [x] Dev mode handles OpenCode-unavailable startup gracefully (connected=false, no crash).
- [x] Existing simulator E2E tests remain stable in `sim:test` mode.
- [x] Mode behavior is documented for contributors.

## Task Tracker

- **Status:** Done
- **Owner:** TBD
- **Blocked By:** None
- **Unblocks:** Ticket 5

## Test Plan (Additions)

- Add focused simulator E2E coverage for mode contract + SSE idempotency:
  - `simulator/tests/smoke.spec.ts`
    - `window.__sim.mode` is `"test"` under Playwright (`sim:test`).
    - repeated init path does not produce duplicate token/tool stream artifacts.

- Add docs section in `CONTRIBUTE.md`:
  - when to use `npm run sim` vs `npm run sim:test`;
  - expectation that Playwright always runs in deterministic test mode.

## Implementation Checklist

- [x] Add/confirm focused simulator spec assertions:
  - [x] `window.__sim.mode === "test"` in Playwright run.
  - [x] repeated init path does not produce duplicate streaming artifacts.
- [x] Confirm `init_opencode` in dev-unavailable case leaves chat status disconnected and app stable.
- [x] Add contributor docs for simulator mode expectations in `CONTRIBUTE.md`.
- [x] Re-run focused simulator specs after docs/code changes.

## Verification

- Manual:
  - Run `npm run sim` with OpenCode up and down; verify status behavior.
  - Re-trigger init flow and confirm no duplicate token emissions.
- Automated:
  - `just test-e2e` (or focused simulator specs)
  - `just test-frontend` (for any shared event plumbing changes)

## Verification Commands

```bash
npm run sim:test
just test-e2e
just test-frontend
```

## Risks

- Browser SSE semantics can differ from backend event bridge expectations.
- Over-aggressive reconnect loops can create noisy logs.

## Out of Scope

- Replacing simulator architecture entirely.
- Adding new OpenCode API surface beyond current command mapping.
