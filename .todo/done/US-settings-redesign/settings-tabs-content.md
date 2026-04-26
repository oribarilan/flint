# settings-tabs-content

## Context

Wire up the actual settings controls in all 4 tabs. Replace placeholder content with real config read/write using the `useConfig` hook's `config` and `onUpdate` props.

**Value delivered**: All `FlintConfig` fields are exposed and editable in the settings UI. Users can configure every aspect of Flint from a single, organized settings view.

## Related Files

- `src/renderer/src/components/Settings.tsx` — add tab content
- `src/renderer/src/components/Settings.module.css` — control styles (section cards, toggles, inputs, segmented controls, mono badges)
- `src/main/types.ts` (or shared types) — `FlintConfig` shape reference
- `showcases/settings-tabs-showcase.html` — Variant A content layout reference

## Dependencies

- `settings-layout.md` (layout and tab switching must exist)

## Acceptance Criteria

- [ ] **General tab**: Overlay hotkey shown as read-only mono badge; Launch at login toggle (`role="switch"`, `aria-checked`); Show tray icon toggle
- [ ] **AI & Models tab**: Chat model shown as read-only mono badge; Background polling toggle; Poll frequency as segmented control (Relaxed/Normal/Aggressive) — disabled when polling is off (0.5 opacity, `pointer-events: none`); Poll model as read-only mono badge
- [ ] **Notifications tab**: Alert before meeting number input (1–60 range, clamped) with "min" suffix
- [ ] **Appearance tab**: Theme segmented control (Dark active, Light `aria-disabled="true"` with visible "Coming soon" label); Font size segmented control placeholder (XS/S/M/L) — wired in next task
- [ ] All controls read from `config` prop and write via `onUpdate(partial)` — optimistic local updates
- [ ] Settings grouped in section cards (`--bg-secondary`, `--border-subtle`, `--radius-md`) with optional `section-card-title` labels
- [ ] Setting rows: label + optional description on left, control on right
- [ ] All interactive controls have hover, focus-visible, and disabled states per design spec
- [ ] Existing control CSS (toggle, number input, select) extracted/reused — not duplicated
- [ ] Unit tests: each tab renders correct controls; toggling a switch calls `onUpdate` with correct payload; number input clamps values
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests covering control rendering and interaction per tab
- **Ad-hoc**: `just check` passes; visual inspection matches showcase Variant A

## Notes

- Segmented control is a new component pattern (not in current codebase). Extract as a reusable `SegmentedControl` component — it appears 3 times across settings (poll frequency, theme, font size).
- Read-only values (hotkey, model, poll model) use mono badge styling: `--font-mono`, `--bg-secondary`, `--radius-sm`, `--text-secondary`.
- Description text under labels uses `--font-sm`, `--text-secondary`, tight line-height (1.4).
