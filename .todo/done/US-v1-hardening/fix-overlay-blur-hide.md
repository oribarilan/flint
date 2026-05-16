# fix-overlay-blur-hide

## Context

`src/main/window/overlay.ts:31-33`:
```ts
overlayWindow.on("blur", () => {
  hideOverlay();
});
```

The overlay is unconditionally hidden whenever it loses focus. Concrete failure cases:
- User clicks the "Open" button on a meeting card → meeting opens in browser → overlay vanishes mid-action. User has to re-summon to see what happened.
- User opens the model picker, then clicks outside it → the overlay (not just the picker) hides.
- User alt-tabs to copy something from another window to paste into chat → overlay gone.
- User triggers a system auth flow → overlay gone.
- (Subtle) User opens settings → settings opens within the overlay → if any focus event leaks, the overlay can hide unexpectedly.

A hotkey-summoned overlay is a *toggle*, not a strict modal. The intent to dismiss is signaled by Esc, the hotkey, or an explicit overlay:hide IPC — not by every focus loss.

**Value delivered**: Removes the most user-visible UX footgun in the app. Makes the overlay actually usable for actions that involve external windows.

## Related Files

- `src/main/window/overlay.ts:31-33` — the offending blur handler
- `src/main/window/overlay.ts:38-57` — show/hide/toggle helpers
- `src/main/window/hotkey.ts` — toggle binding
- `src/main/copilot/tools.ts:230-241` — `join_meeting` opens external URL
- `src/main/ipc/handlers.ts:39-57` — `attention:open` and `link:open` open external URLs
- `src/renderer/src/App.tsx` — `Esc` handler calls `window.flint.hideOverlay()`

## Dependencies

None.

## Acceptance Criteria

- [ ] Remove the unconditional `overlayWindow.on("blur", hideOverlay)` handler
- [ ] Overlay hides ONLY in response to: Esc keypress (existing), global hotkey toggle (existing), explicit `overlay:hide` IPC from renderer (existing), or system tray "Hide" menu item if added
- [ ] Manually verified scenarios all keep the overlay visible:
  - Click "Open" on an attention card → overlay stays visible after browser opens
  - Click "Join" / `join_meeting` triggered → overlay stays visible
  - Click model picker button, then click outside picker → picker closes, overlay stays visible
  - Open Settings, then alt-tab → overlay stays visible
  - Click in another app window → overlay stays visible
- [ ] Overlay still hides correctly on: Esc, global hotkey toggle (re-press), tray click toggle
- [ ] If a UX concern arises about overlay being "always there," consider opt-in setting `hideOnBlur: boolean` (default false) — but DO NOT add unless explicitly requested

## Verification

**Ad-hoc (required):** run all six scenarios above manually in dev mode. Each must keep the overlay visible.

**Automated (preferred if feasible):** Playwright E2E test in `tests/e2e/` that:
1. Launches the app, shows the overlay
2. Programmatically blurs the window (or focuses another mock window)
3. Asserts the overlay is still visible
4. Sends Esc; asserts overlay hides

## Notes

- This is a 1-line code change with massive UX impact. The complexity is in the verification.
- If the team later decides ambient-style auto-hide IS desirable in some context (e.g., after 30s of true idle), that's a future feature with explicit affordance — not a side effect of `blur`.
- macOS quirk: the BrowserWindow may receive `blur` when focus moves to a child popup window (model picker). Confirm during verification.
- Consider whether `alwaysOnTop: true` (already set) needs to remain — once the overlay doesn't auto-hide, it might feel intrusive. Defer to UX critique in `US-polish-refactor`.
