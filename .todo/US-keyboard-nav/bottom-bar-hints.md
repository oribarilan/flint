# bottom-bar-hints

## Context

With keyboard shortcuts implemented, users need discoverability. The bottom bar is the natural place to show navigation hints — it's always visible and already contains the model indicator and settings button.

**Value delivered**: Users discover keyboard shortcuts without reading docs.

## Related Files

- `src/renderer/src/App.tsx` — bottom bar footer
- `src/renderer/src/App.module.css` — bottom bar styles
- `src/renderer/src/components/HotkeyHint.tsx` — reusable hint component (from hotkey-hint task)

## Dependencies

- `hotkey-hint.md` — the HotkeyHint component must exist

## Acceptance Criteria

- [ ] Bottom bar shows navigation hints between the model indicator (left) and settings button (right)
- [ ] Hints render as: `⌃J ⌃K navigate · ⌃U ⌃D scroll · / chat` using `HotkeyHint` components + label text
- [ ] Hint text uses `--text-placeholder` color, `--font-xs` size — subtle, non-competing
- [ ] The `·` separator is a middle dot in `--text-placeholder` color
- [ ] Hints section is horizontally centered (or positioned to avoid crowding the model indicator and settings button)
- [ ] On narrow overlays, hints gracefully hide or truncate (not overflow)
- [ ] Unit test: bottom bar renders hotkey hint elements with correct key text

## Verification

- **Automated**: Unit test that the hint elements are present in the rendered bottom bar
- **Ad-hoc**: `just check` passes. Visual inspection in dev mode — hints are visible, subtle, well-positioned.

## Notes

The bottom bar layout is now: `[model indicator] [hints center] [settings gear]`. Use `flex` with the hints in a centered group. If space is tight, the hints can use `overflow: hidden` with no wrapping.
