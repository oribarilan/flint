# shared-config-types

## Context

The renderer-side `useConfig.ts` defines its own duplicate `FlintConfig` type and `DEFAULT_CONFIG` with divergent defaults (hotkey is `Option+Space` vs `Ctrl+Shift+Space` in the canonical `src/main/types.ts`). This is a DRY violation — any new config field must be added in two places, and default drift causes subtle bugs.

The renderer already has a cross-process import pattern: `src/renderer/src/lib/ipc.ts` imports from `../../../main/types` via relative path. The fix is to follow this same pattern in `useConfig.ts`.

**Value delivered**: Single source of truth for `FlintConfig` across main and renderer processes. No more duplicate type definitions or divergent defaults.

## Related Files

- `src/main/types.ts` — canonical `FlintConfig`, `PollFrequency`, and `DEFAULT_CONFIG`
- `src/renderer/src/hooks/useConfig.ts` — duplicate local `FlintConfig` type and `DEFAULT_CONFIG` to remove
- `src/renderer/src/lib/ipc.ts` — already imports `FlintConfig` from `../../../main/types` (the pattern to follow)

## Dependencies

- None

## Acceptance Criteria

- [ ] `useConfig.ts` imports `FlintConfig` and `DEFAULT_CONFIG` from `src/main/types.ts` (same relative import pattern as `ipc.ts`) — local type definition and local `DEFAULT_CONFIG` are removed
- [ ] No duplicate `interface FlintConfig` definitions exist — `grep -r "interface FlintConfig" src/` returns exactly one result (in `src/main/types.ts`)
- [ ] No duplicate `DEFAULT_CONFIG` definitions exist in renderer code
- [ ] `useConfig` hook still exports the `FlintConfig` type for consumers (re-export from the import)
- [ ] `just check` passes (typecheck, lint, tests)

## Verification

- **Ad-hoc**: `grep -r "interface FlintConfig" src/` returns exactly one result; `just check` passes
- **Automated**: existing tests pass (typecheck catches any import issues)

## Notes

No `src/shared/` directory or tsconfig changes needed — the relative import pattern (`../../../main/types`) is already established and working in `ipc.ts`.
