# font-size-infra

## Context

`global.css` already defines four font size presets via `html[data-font-size="..."]` selectors (extra-small, small, medium, large). But there's no config field or mechanism to switch between them. This task wires it up.

**Value delivered**: Users can pick their preferred text density. The choice persists across sessions.

## Related Files

- `src/main/types.ts` — add `fontSize` to FlintConfig
- `src/main/config.ts` — add migration, update getAll
- `src/renderer/src/hooks/useConfig.ts` — add `fontSize` field
- `src/renderer/src/App.tsx` — apply `data-font-size` to `<html>` on mount + config changes

## Dependencies

- None (can parallel with theme-infra)

## Acceptance Criteria

- [ ] `FlintConfig` has `fontSize: "extra-small" | "small" | "medium" | "large"` (default: `"medium"`)
- [ ] electron-store migration adds default for existing configs
- [ ] Renderer sets `document.documentElement.dataset.fontSize` from config on mount
- [ ] Changing `fontSize` via config:set updates the attribute immediately (no reload)
- [ ] All four presets render correctly (text scales, layout doesn't break)
- [ ] `just check` passes

## Verification

- **Automated**: Unit test for config migration; visual snapshot test optional
- **Ad-hoc**: `just check` passes; change font size in settings (after task 4), verify text scales across all views
