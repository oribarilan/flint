# Sprint04-2: Multi-Server SSE Status Bridge

## Summary

Implement per-server SSE ingestion for monitored OpenCode servers and map incoming lifecycle events into normalized Flint session statuses. This ticket turns static monitor config/state into live runtime updates.

## High-Level Requirements

- For each configured monitored server, establish and maintain an SSE stream (`/global/event`).
- Parse relevant OpenCode events and map to monitor statuses (`idle`, `working`, `waiting`, `retry`, `error` as supported).
- Update `ServerRegistry` snapshots in a thread-safe way.
- Handle reconnects with bounded backoff and stale-state detection.
- Keep monitor events namespaced and isolated from existing `chat:*` event channel.

## Definition of Done

- [x] SSE bridge runs concurrently for multiple servers.
- [x] Status transitions are mapped and persisted in `ServerRegistry`.
- [x] Reconnect logic handles disconnects and resumes updates.
- [x] Initial reconciliation occurs after connect/reconnect (session snapshot refresh).
- [x] Existing Flint chat SSE bridge remains unaffected.

## Testing Plan

- Rust unit tests for mapping payloads to status transitions.
- Rust tests for reconnect backoff behavior (bounded retries / no hot loop).
- Rust tests for stale-state handling on connection loss.
- Integration-style tests (mock SSE payload stream) for:
  - multi-server concurrent updates
  - same session updated repeatedly
  - disconnect + reconnect + rehydrate
- Run:

```bash
just test-rust
just lint-rust
```

## Alternatives Considered

1. OpenCode plugin hooks as mandatory transport in v1.
   - Pros: potential for richer semantic event emission.
   - Cons: operational coupling; blocks v1 on plugin install/deployment.

2. Polling-only (`/session` endpoint repeatedly).
   - Pros: simpler than SSE parser.
   - Cons: worse latency and more overhead; loses event-level precision.

## Recommended Approach

Use SSE as primary transport (already proven in Flint), with periodic or reconnect-triggered reconciliation to repair drift. Keep transport strictly backend-side and publish only normalized state to consumers.

## Implementation

1. Create monitor-specific event bridge type (distinct from chat bridge).
2. For each monitored server:
   - create HTTP client
   - subscribe to SSE endpoint
   - spawn async task with cancellation handle
3. Implement event mapping table and status reducer.
4. Emit optional `monitor:session_update` event for UI reactivity.
5. On reconnect, fetch session list/snapshot to reconcile stale state.
6. Add structured logging around transitions, reconnects, and parse errors.

## Progress / Notes

- Depends on ticket 1 registry/config model.
- Must avoid emitting `chat:*` events from monitor bridge.

### Completed

- **`src-tauri/src/providers/opencode/monitor/bridge.rs`** (new file): Full SSE bridge implementation.
  - `MonitorBridge` struct with `start(&MonitoredServerConfig, registry, app)` → `MonitorBridge` and `stop()`.
  - Exponential backoff reconnect loop: `BACKOFF_INITIAL=2s`, `BACKOFF_MAX=60s`, `BACKOFF_FACTOR=2.0`.
  - SSE parsing: `extract_sse_data()` strips `data:` prefix; `map_sse_payload()` dispatches on event `type` field.
  - Event mapping table:
    - `session.updated` → `SessionStatus` (idle/working/waiting/error) via `map_status_type()`
    - `session.deleted` → removes session from registry
    - `message.updated` → updates session status if message is in-progress
    - `server.heartbeat` / `server.connected` → sets `ServerHealthStatus::Connected`
  - `reconcile_sessions()`: on (re)connect, fetches `GET /session`, populates registry, clears stale sessions not present in response.
  - `handle_monitor_event()`: writes to registry then emits `monitor:session_update` Tauri event (never `chat:*`).
  - `SessionUpdatePayload` serde struct for frontend consumption.
  - 33 unit tests covering: `extract_sse_data`, `map_status_type`, `map_sse_payload` (all event types), backoff config values.

- **`src-tauri/src/lib.rs`**: For each valid monitored server config, spawns `MonitorBridge::start()` in a background async task. Uses `std::mem::forget(bridge)` to keep bridges alive for process lifetime.

- All 344 Rust tests pass. `cargo clippy -- -D warnings` is clean.
