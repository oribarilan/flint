# Popover Window Architecture

## Context

Replace the centered 1032×520 overlay with a narrow popover anchored to the tray icon. The window appears below the tray in the top right, is smaller (~340px wide), and dismisses on click-outside.

**Value delivered**: Flint's primary interaction became a menubar popover, matching modern macOS patterns. The app feels native and always-accessible.

## Related Files

- `src/main/window/overlay.ts` — popover window (340×480, tray-anchored, transparent, frameless)
- `src/main/window/tray.ts` — tray icon, context menu, click handling
- `src/main/index.ts` — main process entry, hotkey registration, window lifecycle

## Dependencies

- None

## Acceptance Criteria

- [x] BrowserWindow created at ~340px wide, positioned anchored below the tray icon (top-right of screen)
- [x] Window has `transparent: true` and `backgroundColor: '#00000000'`
- [x] Window is frameless, always-on-top, skip-taskbar
- [x] Clicking the tray icon toggles the popover open/closed — **Deviation**: tray click now shows context menu only; overlay opens via "Show Flint" menu item or hotkey. User explicitly requested this change.
- [x] Global hotkey toggles the popover open/closed
- [x] Clicking outside the popover closes it (BrowserWindow `blur` event)
- [x] Escape key closes the popover
- [x] Window re-positions correctly on show (accounts for tray position, display bounds) — positions on active display, anchors to tray when on same display
- [x] `just check` passes

## Verification

- **Ad-hoc**: Verified — popover appears anchored near tray, dismisses on blur and Escape, hotkey toggles.

## Notes

Tray click behavior changed during implementation: user requested menu-only on click (no overlay toggle). The context menu has "Show Flint" to open the overlay explicitly. Active display positioning added — overlay appears on whichever monitor the cursor is on.
