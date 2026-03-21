# Sprint 04 — Multi-Server OpenCode Session Monitoring

## Theme

Add a new Flint capability to monitor OpenCode sessions across multiple servers, exposed through a dedicated **Sessions kit command**. Sprint 04 focuses on reliable runtime monitoring and fast query-time rendering, without adding work to Flint’s overlay-ready critical path.

## Summary

This sprint introduces a read-only session monitor that aggregates status from multiple OpenCode servers and presents it via a kit command flow. We will use an **SSE-first** architecture (OpenCode `/global/event`) for v1 to minimize moving parts and leverage existing Flint event-bridge patterns. A plugin-hook integration remains a valid future extension, but is not required to deliver v1.

## Decisions (from Sprint 04 planning)

1. **Integration path:** SSE-first (no plugin required for v1).
2. **Primary UX surface:** Kit command (`sessions`) with prefix activation.
3. **Scope:** Monitor **multiple OpenCode servers**.
4. **v1 interaction model:** Read-only monitor (status + metadata); no remote control actions yet.
5. **Critical prefix rule:** Prefix behavior must not hijack normal file search queries that start with `s` (e.g., `safari`). Prefix matching must use delimiter-safe routing (`s `) or equivalent guard.

## In-Scope Tickets

1. `.todo/sprint04/1-monitor-registry-and-config.md`
2. `.todo/sprint04/2-multi-server-sse-status-bridge.md`
3. `.todo/sprint04/3-sessions-kit-command-and-prefix-routing.md`
4. `.todo/sprint04/4-agent-settings-server-management.md`
5. `.todo/sprint04/5-simulator-and-e2e-session-monitoring.md`
6. `.todo/sprint04/6-reliability-performance-and-observability.md`

## Sequencing & Dependencies

### Wave A — Foundation

- **Ticket 1:** monitor registry + config model
- **Ticket 2:** SSE status bridge

Rationale: The runtime data model and event ingestion must exist before any kit or UI can render real data.

### Wave B — User-facing command surface

- **Ticket 3:** sessions kit command + safe prefix routing

Dependency: Ticket 3 depends on Tickets 1–2.

### Wave C — Configuration UX

- **Ticket 4:** settings management for monitored servers

Dependency: Ticket 4 depends on Ticket 1 (config schema) and should land before final E2E to validate realistic flows.

### Wave D — Validation & hardening

- **Ticket 5:** simulator + E2E coverage
- **Ticket 6:** reliability/performance/observability hardening

Dependencies:

- Ticket 5 depends on Tickets 3–4.
- Ticket 6 depends on Tickets 2–5.

## Execution Board

| Ticket | Status | Owner | Blocked By | Notes                   |
| ------ | ------ | ----- | ---------- | ----------------------- |
| 1      | Done   | TBD   | None       | Config + runtime state  |
| 2      | Done   | TBD   | 1          | SSE mapping + reconnect |
| 3      | Done   | TBD   | 1,2        | Kit command + routing   |
| 4      | Done   | TBD   | 1          | Settings UX for servers |
| 5      | Done   | TBD   | 3,4        | Simulator + Playwright  |
| 6      | Done   | TBD   | 2,3,4,5    | Hardening pass          |

## Sprint-Level Guardrails

1. **Overlay-ready path must remain instant:** no network calls or heavy initialization on window show.
2. **Result processing path must remain smooth:** kit search uses in-memory snapshots only; no blocking I/O.
3. **Backend authority:** frontend displays backend-reported monitor state, never inferred from config fallbacks.
4. **Status semantics:** if “waiting” state cannot be determined reliably from SSE events, degrade gracefully to `Working` rather than guessing.

## Verification Plan

Per-ticket testing plans are defined in each task file. Sprint-level validation target:

```bash
just test-rust
just test-frontend
just test-e2e
just lint
just format
just check
```

## Definition of Done (Sprint)

- [x] Flint can monitor sessions across multiple configured OpenCode servers.
- [x] Sessions kit command shows meaningful statuses (idle/working/waiting/error as available).
- [x] Prefix activation is safe and does not degrade normal search discoverability.
- [x] Monitor reconnects after server/SSE interruptions without user restart.
- [x] Simulator and Playwright coverage exists for monitor lifecycle and status updates.
- [x] No measurable regression is introduced to overlay-ready or search-per-keystroke responsiveness.

## Final verification snapshot

- `just check` ✅
- `just test-e2e` ✅

## Risks

- **Prefix collision risk:** single-char prefixes can steal standard search queries if routing is naive.
- **Event ambiguity risk:** OpenCode may not emit all semantic states directly; inferred states can be noisy.
- **Connection churn risk:** multiple SSE streams can flap and create stale status unless heartbeat/reconciliation exists.
- **Scope creep risk:** plugin-hook work can expand quickly; keep it explicitly deferred unless promoted by user.

## Out of Scope (for Sprint 04)

- Managing remote OpenCode server process lifecycle (start/stop) from Flint.
- Writing to monitored sessions (send prompt / abort / control operations).
- Dedicated full-screen sessions dashboard mode.
- Mandatory OpenCode plugin dependency for v1 monitoring.
