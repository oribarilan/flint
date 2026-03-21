# Sprint04-1: Multi-Server Monitor Registry and Config Model

## Summary

Introduce the foundational backend model for monitoring multiple OpenCode servers: config schema, validation rules, runtime registry state, and lifecycle hooks. This ticket establishes the source-of-truth state Flint will use for session-monitor features in later tickets.

## High-Level Requirements

- Add a config structure for monitored OpenCode servers with explicit fields (`id`, `host`, `port`, optional label/metadata if needed).
- Keep existing single Flint chat provider behavior intact while adding parallel monitoring capability.
- Add runtime managed state (`ServerRegistry`) that can hold per-server health and per-session status snapshots.
- Validate config to prevent invalid and conflicting entries (duplicate IDs, invalid host/port combinations, collisions with Flint-managed OpenCode server where relevant).
- Ensure monitor initialization can occur asynchronously and non-blocking during app startup.

## Definition of Done

- [x] `FlintConfig` supports monitored-server configuration and round-trips via TOML.
- [x] Validation exists for malformed or conflicting monitored server entries.
- [x] `ServerRegistry` managed state is implemented with concurrency-safe access.
- [x] Registry lifecycle hooks exist for startup and shutdown integration points.
- [x] Existing OpenCode chat flow remains functional and unchanged in behavior.

## Testing Plan

- Rust unit tests for config parsing, defaults, and validation edge cases:
  - duplicate server IDs
  - duplicate host+port tuples
  - invalid ports
  - empty/whitespace IDs
- Rust unit tests for registry operations:
  - register server snapshot
  - update server health
  - update/create session snapshot
  - remove server / clear state
- Run:

```bash
just test-rust
just lint-rust
```

## Alternatives Considered

1. Extend `OpenCodeProvider` to become multi-server.
   - Pros: fewer top-level structs.
   - Cons: mixes Flint chat transport/process ownership with read-only monitor concerns; higher regression risk.

2. Keep monitor state frontend-only.
   - Pros: quick UI prototyping.
   - Cons: violates backend authority rule and makes robust reconnect/reconciliation harder.

## Recommended Approach

Create a dedicated backend monitor domain (`ServerRegistry`) and keep it independent from `OpenCodeProvider`. This separation keeps the existing chat path stable, aligns with single-responsibility, and supports SSE-driven updates efficiently.

## Implementation

1. Add monitored-server config types in `src-tauri/src/config.rs` and include them in `FlintConfig`.
2. Add config validation utility for monitored servers.
3. Create monitor state module under OpenCode provider domain (e.g., `providers/opencode/monitor/`).
4. Define core types:
   - `MonitoredServer`
   - `MonitoredSession`
   - `SessionMonitorStatus`
   - `ServerHealthStatus`
5. Add `ServerRegistryState` managed state wrapper and wire into `lib.rs` setup.
6. Add startup/shutdown hooks for future bridge integration (no network behavior in this ticket beyond structure).

## Progress / Notes

- Planned as Sprint 04 foundation ticket.
- Downstream tickets depend on this model as the single source of monitor state.

### Completed

- **`src-tauri/src/config.rs`**: Added `MonitoredServerConfig` struct (`id`, `host`, `port`, `label` fields), `MonitoredServerConfigError` enum, and `validate_monitored_servers()` function covering: duplicate IDs, duplicate host+port combos, empty/whitespace IDs, invalid port 0. Added `monitored_servers: Vec<MonitoredServerConfig>` to `FlintConfig` with `#[serde(default)]` for TOML round-trip compatibility.

- **`src-tauri/src/providers/opencode/monitor/mod.rs`**: Pre-existing file. Added `pub mod bridge;` declaration. Made `servers` field `pub(super)` for bridge access. Added `servers_mut_sessions_clear()` helper. Fixed all pedantic/nursery clippy issues (backtick doc comments, `#[derive(Default)]` on enums, `const fn` on `label()`/`badge_color()` methods).

- **`src-tauri/src/lib.rs`**: Wired `ServerRegistryState` as managed state. Seeds registry from `config.monitored_servers` via `replace_config()` on startup. Invalid entries are logged and skipped (no panic). Bridge spawning added (ticket 2 work, depends on this foundation).

- All 344 Rust tests pass. `cargo clippy -- -D warnings` is clean.
