# font-size-setting

## Context

The app already defines 4 font size presets in `global.css` via `html[data-font-size]` attributes (extra-small, small, medium, large), but there's no UI to switch between them. Add a working font size segmented control in the Appearance tab.

**Value delivered**: Users can adjust text density across the entire interface from settings.

## Related Files

- `src/renderer/src/components/Settings.tsx` — Appearance tab, font size control
- `src/renderer/src/styles/global.css` — `html[data-font-size]` presets (extra-small, small, medium, large)
- `src/main/types.ts` (or shared types) — `FlintConfig` needs a `fontSize` field
- `src/main/config.ts` — default config, migration for new field
- `src/renderer/src/hooks/useConfig.ts` — passes config to renderer

## Dependencies

- `settings-tabs-content.md` (Appearance tab must exist with the placeholder segmented control)

## Acceptance Criteria

- [ ] `FlintConfig` gains `fontSize: FontSize` where `FontSize = "extra-small" | "small" | "medium" | "large"` (default: `"medium"`)
- [ ] Config store migration added for the new field (sets `"medium"` on existing configs)
- [ ] `config.ts` `getAll()` returns the new `fontSize` field from the store (add `fontSize: store.get('fontSize', DEFAULT_CONFIG.fontSize)`)
- [ ] Invalid persisted `fontSize` values fall back to `"medium"`
- [ ] Appearance tab font size segmented control displays 4 options: XS, S, M, L
- [ ] Clicking an option calls `onUpdate({ fontSize: value })` and sets `document.documentElement.dataset.fontSize` to the selected preset
- [ ] On app load, the `data-font-size` attribute is set from the persisted config value
- [ ] The active option in the segmented control reflects the current `config.fontSize`
- [ ] Unit test: selecting a font size option calls `onUpdate` with correct value
- [ ] `just check` passes

## Verification

- **Automated**: Unit test for font size control interaction
- **Ad-hoc**: `just check` passes; changing font size in settings visibly changes text sizes in the main view

## Notes

- The `data-font-size` attribute must be set early — ideally in the renderer's entry point or App component's initial effect, before first paint.
- The segmented control labels (XS, S, M, L) map to config values: `extra-small`, `small`, `medium`, `large`.
- Consider applying the attribute change immediately (before IPC round-trip) for instant visual feedback.
