# config-background-agent

## Context

The Pulse scheduler needs three new config fields: `pollEnabled`, `pollFrequency`, and `pollModel`. These require a FlintConfig type update and an electron-store migration.

**Value delivered**: User can control background polling behavior. Foundation for the Background Agent settings tab (UI is out of scope here).

## Related Files

- `src/main/types.ts` — `FlintConfig` and `DEFAULT_CONFIG`
- `src/main/config/` — electron-store setup (if exists, or wherever config store is created)
- `src/main/ipc/handlers.ts` — config:get/config:set handlers

## Dependencies

- None (can run in parallel with refactor-main-wiring)

## Acceptance Criteria

- [ ] `FlintConfig` has `pollEnabled: boolean` (default: `true`)
- [ ] `FlintConfig` has `pollFrequency: "relaxed" | "normal" | "aggressive"` (default: `"normal"`)
- [ ] `FlintConfig` has `pollModel: string` (default: `"gpt-4.1-mini"`)
- [ ] electron-store migration adds defaults for existing configs
- [ ] `config:get` and `config:set` work with the new fields
- [ ] `just check` passes

## Verification

- **Automated**: Unit test for migration (old config → new config with defaults)
- **Ad-hoc**: `just check` passes
