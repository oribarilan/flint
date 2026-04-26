# focus-input-on-show

## Context

When the overlay is shown (via hotkey or tray), keyboard focus stays wherever it was left from the previous session — often on a suggestion card, attention item, or nowhere useful. The input bar should always receive focus when the overlay appears so the user can start typing immediately.

**Value delivered**: The overlay feels instant and keyboard-ready. No extra Tab/click to start typing.

## Related Files

- `src/main/window/overlay.ts` — `showOverlay()` / hotkey handler that shows the window
- `src/renderer/src/App.tsx` — root component, manages focus
- `src/renderer/src/components/ChatInput.tsx` — the input bar (likely has a ref or `autoFocus`)
- `src/main/window/hotkey.ts` — global hotkey registration

## Dependencies

- None

## Acceptance Criteria

- [ ] When the overlay is shown via hotkey, the chat input is focused within one frame
- [ ] When the overlay is shown via tray click, the chat input is focused within one frame
- [ ] If a chat response is in progress (streaming), focus still moves to input
- [ ] If the settings modal is open when overlay is re-shown, input is not focused (settings keeps focus)
- [ ] `just check` passes

## Verification

- **Automated**: E2E test — launch overlay via hotkey, assert `document.activeElement` is the chat input
- **Ad-hoc**: `just dev`, press hotkey, verify cursor blinks in input bar; interact with cards, hide/show overlay, verify input refocuses

## Notes

- The overlay window receives an Electron `focus` event on show — the renderer can listen for this via `window.addEventListener('focus', ...)` or an IPC signal
- Respect the performance-critical overlay-ready path: no network calls, no async work — just a synchronous `.focus()` call
- `prefers-reduced-motion` is irrelevant here (no animation involved)
