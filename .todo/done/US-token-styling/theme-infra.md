# theme-infra

## Context

Flint currently only has a dark theme. The design spec defines a full light theme (Flint Light) with warm amber-tinted neutrals. This task adds the light theme CSS, a `theme` config field, `data-theme` attribute switching, and system preference detection.

**Value delivered**: Users can switch between dark and light themes. System option follows OS preference and updates live.

## Related Files

- `src/renderer/src/styles/global.css` — add `html[data-theme="light"]` token overrides
- `src/main/types.ts` — add `theme` to FlintConfig
- `src/main/config.ts` — add migration, update getAll
- `src/main/index.ts` — resolve system theme, send to renderer, listen for OS changes
- `src/main/ipc/channels.ts` — add `THEME_CHANGED` channel
- `src/preload/index.ts` — expose `onThemeChanged`
- `src/renderer/src/hooks/useConfig.ts` — add `theme` field
- `src/renderer/src/App.tsx` — apply `data-theme` to `<html>` on mount + changes

## Dependencies

- `token-cleanup.md` (new tokens like `--color-warning-bg`, `--bg-backdrop` must exist before light theme overrides them)

## Acceptance Criteria

- [ ] `global.css` has `html[data-theme="light"]` block overriding all color, border, shadow, and scrollbar tokens with warm light values
- [ ] Light theme uses warm hue 65, chroma 0.012–0.02 on backgrounds (perceptible warmth, not invisible)
- [ ] `FlintConfig` has `theme: "dark" | "light" | "system"` (default: `"dark"`)
- [ ] electron-store migration adds default for existing configs
- [ ] Main process resolves `"system"` via `nativeTheme.shouldUseDarkColors` → `"dark"` or `"light"`
- [ ] Main process sends resolved theme to renderer via `theme:changed` IPC on startup
- [ ] Main process listens to `nativeTheme.on('updated')` and re-sends when OS preference changes (only when config is `"system"`)
- [ ] Renderer sets `document.documentElement.dataset.theme` on received theme
- [ ] Renderer listens for `theme:changed` and updates attribute live
- [ ] Config change from settings triggers theme re-resolution and IPC push
- [ ] All components render correctly in both themes (no broken contrast, no invisible text)
- [ ] `just check` passes

## Verification

- **Automated**: Unit test for theme resolution logic (system → dark/light mapping)
- **Ad-hoc**: `just check` passes; toggle theme in settings, verify all panels/cards/inputs look correct in both themes; test System option by changing macOS appearance

## Notes

- Light theme token values from `specs/design.md` §190, but with boosted chroma (~0.012–0.02 on backgrounds) per the showcase decision
- The `--md-italic-color` and `--md-link-underline` tokens also need light overrides
- Scrollbar tokens (`--scrollbar-thumb`, `--scrollbar-thumb-hover`) need light overrides
