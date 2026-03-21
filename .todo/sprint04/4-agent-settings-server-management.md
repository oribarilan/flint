# Sprint04-4: Agent Settings for Monitored Server Management

## Summary

Add settings UX to manage monitored OpenCode servers used by the Sessions kit. This ticket provides the configuration controls required for users to add, edit, remove, and validate monitor targets.

## High-Level Requirements

- Expose monitored server list in Settings (Agent category or equivalent approved placement).
- Support add/remove/edit of server entries (`id`, host, port, optional label).
- Validate user input with clear, actionable inline errors.
- Persist changes via existing config IPC path and maintain backend-authoritative state.
- Communicate any restart/reconnect implications clearly to the user.

## Definition of Done

- [ ] Settings UI can create, update, and delete monitored servers.
- [ ] Validation prevents invalid or conflicting entries from being saved.
- [ ] Persisted config round-trips correctly and reflects in backend registry lifecycle.
- [ ] UX copy clearly explains what is being monitored and expected server prerequisites.
- [ ] Existing Agent settings (provider/model sections) remain functional.

## Testing Plan

- Frontend component tests for monitored server form interactions and error states.
- Frontend tests for save/cancel/reset flows.
- Rust tests for persistence and validation integration (where command-layer behavior changes).
- Run:

```bash
just test-frontend
just test-rust
just lint
```

## Alternatives Considered

1. Keep server configuration TOML-only (no UI).
   - Pros: fastest backend delivery.
   - Cons: poor UX and higher setup friction.

2. Add a new dedicated Settings category immediately.
   - Pros: clear separation.
   - Cons: extra navigation scope; may be unnecessary for v1.

## Recommended Approach

Add monitored-server management to Agent Settings in v1 to minimize UI sprawl while keeping setup discoverable. If scope grows later, split into dedicated category.

## Implementation

1. Extend settings data model/commands TS wrappers for monitored server fields.
2. Add UI section in Agent settings:
   - server list
   - add/edit row form
   - delete action
3. Add field-level and aggregate validation messages.
4. Save through `update_config` path; refresh backend state view after successful save.
5. Document any required reconnect/restart notices consistently with existing settings patterns.

## Progress / Notes

- Depends on ticket 1 config model.
- Should land before E2E ticket to enable realistic user-path verification.

### Implementation complete

All work merged into main. Summary:

**`src/lib/commands.ts`** — Added `MonitoredServerConfig` interface (`id`, `host`, `port`, `label?`). Added `monitored_servers: MonitoredServerConfig[]` to `FlintConfig`.

**`src/components/settings/AgentSettings.tsx`** — Added Monitored Servers section:

- Lists all configured servers (id, host:port, optional label)
- "Add" button opens inline add form (hidden when form is open)
- Inline `ServerForm` sub-component: ID, host, port (number input), optional label inputs
- Keyboard support: Enter = save, Escape = cancel
- "Edit" button per row opens prefilled inline edit form
- "Remove" button per row deletes the entry immediately
- Full field validation: empty ID, empty host, port out of range 1–65535, duplicate ID, duplicate host+port
- Errors displayed inline below the form
- Persists via `onUpdate` → `update_config` IPC → backend `ServerRegistryState` (seeded from `monitored_servers` on startup)

**`src/components/settings/__tests__/AgentSettings.test.tsx`** — Added 12 new tests in `AgentSettings — Monitored Servers` describe block covering:

- Empty state hint
- Add button visibility
- Opening add form
- Cancel clears form
- Validation: empty ID, empty host, invalid port, duplicate ID
- Saving valid server (calls onUpdate with correct payload)
- Rendering existing server list
- Remove server
- Edit opens prefilled form

All DoD items met. `just check` passes (344 Rust + 346 frontend tests green).
