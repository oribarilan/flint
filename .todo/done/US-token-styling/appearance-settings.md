# appearance-settings

## Context

The theme and font size config fields exist but have no UI. This task adds an "Appearance" section to the Settings panel with dropdowns for both.

**Value delivered**: Users can control theme and font size from Settings without touching config files.

## Related Files

- `src/renderer/src/components/Settings.tsx` — add Appearance section
- `src/renderer/src/components/Settings.module.css` — reuse existing `.select` class
- `src/renderer/src/hooks/useConfig.ts` — FlintConfig type (already has theme + fontSize from prior tasks)

## Dependencies

- `theme-infra.md` (theme field must exist in config)
- `font-size-infra.md` (fontSize field must exist in config)

## Acceptance Criteria

- [ ] Settings has an "Appearance" section between "Shortcut" and "Notifications"
- [ ] Theme row: `<select>` with options "Dark", "Light", "System" — bound to `config.theme`
- [ ] Font size row: `<select>` with options "Extra Small", "Small", "Medium", "Large" — bound to `config.fontSize`
- [ ] Selecting a theme applies it immediately (no save button, no reload)
- [ ] Selecting a font size applies it immediately
- [ ] Both choices persist across app restarts
- [ ] Uses existing `.select` CSS class (no new styles needed)
- [ ] `just check` passes

## Verification

- **Automated**: Unit test for Settings rendering the new section with correct options
- **Ad-hoc**: `just check` passes; change theme and font size in settings, verify immediate effect, restart app, verify persistence
