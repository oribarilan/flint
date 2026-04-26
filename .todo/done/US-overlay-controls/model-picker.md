# model-picker

## Context

With the model indicator in the bottom bar (from `model-display`), users need a way to actually switch models. This task adds a popover picker anchored above the model button.

**Value delivered**: Users can switch Copilot models without touching config files.

## Related Files

- `src/renderer/src/App.tsx` — manages `isPickerOpen` state, escape stack
- `src/renderer/src/components/ModelPicker.tsx` — new component
- `src/renderer/src/components/ModelPicker.module.css` — new styles
- `src/renderer/src/stores/modelStore.ts` — `models` array, `currentModel`
- `src/renderer/src/lib/ipc.ts` — `window.flint.listModels()`, `window.flint.setModel()`
- `src/renderer/src/styles/global.css` — design tokens

## Dependencies

- `model-display.md` — IPC channels, modelStore, bottom bar button

## Acceptance Criteria

- [ ] Clicking the model button in the bottom bar toggles `isPickerOpen` state in App
- [ ] `ModelPicker` component renders a popover anchored above the model button, left-aligned
- [ ] On first open, calls `window.flint.listModels()` and caches result in `modelStore.models`
- [ ] Each row shows the model `name`. Current model has a `Check` icon (16px, `--accent`) on the left. Non-selected rows have equivalent left padding for alignment.
- [ ] Hover state: `--bg-hover` on the row
- [ ] Arrow up/down moves keyboard focus through the list
- [ ] Enter selects the focused model: calls `window.flint.setModel(id)`, closes picker
- [ ] ESC closes the picker (via escape stack — `isPickerOpen` is checked before overlay hide)
- [ ] Clicking outside the popover closes it
- [ ] Popover has `max-height` cap (~240px), scrollable with `overscroll-behavior: contain` if list exceeds it
- [ ] Styling uses design tokens only: `--bg-primary` background, `--border-subtle` border, `--radius-md` corners, `--shadow-lg` elevation
- [ ] `prefers-reduced-motion` respected (no open/close animation, or reduced if added)
- [ ] Focus is trapped inside popover while open
- [ ] `aria-expanded` on trigger button, `role="listbox"` on popover, `role="option"` on items, `aria-selected` on current model
- [ ] Unit tests for: picker renders models, keyboard navigation, selection calls setModel, ESC closes picker

## Verification

- **Automated**: Unit tests for ModelPicker component (render, keyboard nav, selection, dismiss), integration with escape stack
- **Ad-hoc**: `just check` passes. Dev mode — click model name, see picker, arrow through, select, confirm bottom bar updates.

## Notes

The popover is a plain component positioned with CSS (`position: absolute`, `bottom: 100%`), not a portal. Since it lives inside the overlay window, z-index stacking within the app is sufficient. No need for a popover library.
