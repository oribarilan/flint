# US-token-styling

## Goal

Full design token compliance, light theme, system theme detection, and font size control. Every visual property flows through semantic tokens, users can switch between dark/light/system themes and four font size presets.

## Definition of Done

- [ ] All hardcoded colors, shadows, and spacing in CSS modules replaced with design tokens
- [ ] Light theme (warm hue 65, boosted chroma) renders correctly across all components
- [ ] Theme dropdown (Dark / Light / System) in Settings works and persists
- [ ] System option follows OS preference and updates live when OS setting changes
- [ ] Font size dropdown (Extra Small / Small / Medium / Large) in Settings works and persists
- [ ] `just check` passes

## Task Priority

1. `token-cleanup.md` — Fix hardcoded values, add missing tokens. No dependencies.
2. `theme-infra.md` — Light theme CSS, config field, data-theme switching, system detection.
3. `font-size-infra.md` — Config field, data-font-size switching. Can parallel with 2.
4. `appearance-settings.md` — Settings UI for theme + font size. Depends on 2 and 3.

## Cross-Cutting Concerns

- **Performance**: Theme and font size changes are CSS custom property swaps via `data-*` attributes on `<html>`. No re-renders, no IPC, no layout thrash.
- **Light theme chroma**: Background chroma at 0.012–0.02 range (not 0.005 — too subtle to perceive). The warm tint must be visible.
- **System theme**: Resolved in main process via `nativeTheme.shouldUseDarkColors`. Main sends resolved theme to renderer via IPC. `nativeTheme.on('updated')` handles live OS changes.
- **Spec**: `specs/design.md` already defines both themes' full token sets (Flint Dark §162, Flint Light §190). The light theme chroma values in the spec need bumping per the showcase decision.
