# Sprint04-6: Reliability, Performance, and Observability Hardening

## Summary

Harden the session-monitor implementation for production behavior under connection churn, larger monitored sets, and ambiguous event sequences. This ticket ensures Sprint 04 ships with robust failure handling and no critical-path performance regressions.

## High-Level Requirements

- Add guardrails for monitor scale (server/session caps, stale pruning strategy).
- Ensure monitor update paths avoid blocking search-time reads.
- Improve resilience for reconnect storms and stale state.
- Add structured logging and diagnostics for monitor lifecycle and transitions.
- Validate no regressions to overlay-ready and per-keystroke search responsiveness.

## Definition of Done

- [x] Concurrency model is safe and search path remains non-blocking.
- [x] Reconnect/staleness behavior is deterministic and user-visible states remain coherent.
- [x] Resource limits (caps/pruning) are implemented and documented.
- [x] Logs provide actionable visibility without leaking sensitive content.
- [x] Final sprint verification commands pass.

## Testing Plan

- Rust tests for pruning/caps and stale-state transitions.
- Stress-style tests for frequent status updates and reconnect loops.
- Frontend/store tests for coherent status display under rapid transitions.
- Validate with:

```bash
just test-rust
just test-frontend
just lint
just format
just check
```

## Alternatives Considered

1. Defer hardening to post-sprint bugfix cycle.
   - Pros: faster feature delivery.
   - Cons: higher risk of unstable user experience and regressions.

2. Over-engineer with complex distributed coordination in v1.
   - Pros: theoretical future-proofing.
   - Cons: complexity cost and delivery risk for current scope.

## Recommended Approach

Apply focused hardening for known failure modes (reconnects, stale data, lock contention, scale bounds) while keeping architecture simple and maintainable.

## Implementation

1. Add caps and pruning policy to monitor registry.
2. Audit lock usage; ensure kit search reads do not block on long monitor writes.
3. Add heartbeat/staleness markers and server-health transitions.
4. Add structured logs for server connect/disconnect, status transitions, and reconciliation cycles.
5. Run and document final sprint verification matrix.

## Progress / Notes

- Final sprint hardening gate.
- Depends on functional completion of monitor bridge, kit, settings, and E2E coverage.

### Completed

- **Runtime caps and pruning**:
  - `src-tauri/src/config.rs`: Added `MAX_MONITORED_SERVERS` and validation error `TooManyServers`.
  - Added `sanitize_monitored_servers(...)` helper to enforce dedupe + cap + normalization.
  - `src-tauri/src/providers/opencode/monitor/mod.rs`: Added `MAX_SESSIONS_PER_SERVER`, `STALE_SESSION_MAX_AGE_SECS`, per-server cap enforcement, and `prune_stale_sessions(...)`.

- **Reconnect/staleness hardening**:
  - `src-tauri/src/providers/opencode/monitor/bridge.rs`: Added heartbeat timeout guard (`STALE_HEARTBEAT_TIMEOUT`), health updates on heartbeat, and stale pruning on event flow.

- **Concurrency and lifecycle**:
  - `src-tauri/src/providers/opencode/monitor/manager.rs`: Added `MonitorBridgeManager` + managed state wrapper to own bridges.
  - `src-tauri/src/lib.rs`: Replaced fire-and-forget bridge leaks with manager-owned bridge startup + shutdown on main window destroy.
  - `src-tauri/src/commands/config.rs`: `update_config` now validates/sanitizes monitored servers, refreshes monitor registry, and restarts bridges safely.

- **Frontend non-blocking refresh correctness**:
  - `src/hooks/useSearch.ts`: Prevent stale search writes across command switches by checking both `kitId` + `commandId`.
  - `src/hooks/useSessionMonitor.ts` + tests: monitor events refresh active sessions command search safely.
  - `src/hooks/usePrefixDetection.ts` + tests: fixed trailing-space prefix handling (`"s "`) without requiring double-space input.

- **Verification**:
  - `just check` ✅
  - `just test-e2e` ✅
