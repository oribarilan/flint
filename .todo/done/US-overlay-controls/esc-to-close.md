# esc-to-close

## Context

The overlay panel has no keyboard shortcut to dismiss it. Users expect ESC to close a floating panel. Currently ESC only closes the Settings modal (handled locally in `Settings.tsx`).

**Value delivered**: The overlay becomes keyboard-dismissible, matching standard desktop UX expectations.

## Related Files

- `src/renderer/src/App.tsx` — root component, owns bottom bar and settings state
- `src/renderer/src/components/Settings.tsx` — has its own ESC handler (to be removed)
- `src/renderer/src/lib/ipc.ts` — `window.flint.hideOverlay()`

## Dependencies

- None

## Acceptance Criteria

- [ ] Pressing ESC when the overlay is visible and no modal/popover is open calls `window.flint.hideOverlay()`
- [ ] Pressing ESC when the Settings modal is open closes Settings (does not hide the overlay)
- [ ] Pressing ESC when the model picker is open (added in later task) closes the picker (does not hide the overlay) — design the escape stack to be extensible for this
- [ ] The ESC handler in `Settings.tsx` is removed; all ESC logic is unified in `App.tsx`
- [ ] If chat is mid-stream, ESC still hides the overlay (stream continues in background)
- [ ] Unit tests cover: ESC with nothing open, ESC with settings open, ESC with future popover state

## Verification

- **Automated**: Unit tests for the escape stack logic (mock `hideOverlay`, assert correct layer is closed based on state)
- **Ad-hoc**: `just check` passes. Manual test in dev mode — ESC closes overlay, ESC closes settings first if open.

## Notes

The escape stack is a simple priority check on component state: `isPickerOpen > isSettingsOpen > hideOverlay`. Implemented as a single `useEffect` with a `keydown` listener in `App.tsx`. The stack should be easy to extend — adding a new layer means adding one more condition.
