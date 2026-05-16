# simplify-app-focus-orchestration

## Context

`src/renderer/src/App.tsx:113-135` orchestrates focus across window-focus events, settings open/close, and picker open/close using a ref + a pending flag:

```ts
useEffect(() => {
  const handleWindowFocus = (): void => {
    if (showSettings || isPickerOpen) {
      setShowSettings(false);
      setIsPickerOpen(false);
      pendingFocusRef.current = true;  // defer focus
    } else {
      chatInputRef.current?.focus();
    }
  };
  // ...
}, [showSettings, isPickerOpen]);

useEffect(() => {  // complete deferred focus after re-render
  if (pendingFocusRef.current && !showSettings) {
    chatInputRef.current?.focus();
    pendingFocusRef.current = false;
  }
}, [showSettings]);
```

Two effects coordinating via an imperative ref + flag because focus intent is being driven from three places (window-focus event, settings close, picker close) at React's render boundary. This is a code smell that will produce focus bugs at the seams.

**Value delivered**: Focus intent owned by one explicit state value. No more "why didn't focus go where I expected" bugs.

## Related Files

- `src/renderer/src/App.tsx:113-135` — focus orchestration
- `src/renderer/src/App.tsx:50-60` — `toggleSettings`, `togglePicker`, `closePicker`
- `src/renderer/src/App.tsx:79-90` — Esc handler that touches focus
- `src/renderer/src/App.tsx:205-211` — `chatInputRef` site

## Dependencies

None. Pairs nicely with `decompose-use-keyboard-nav.md` since `useGlobalShortcuts` will own some of the same state, but order is flexible.

## Acceptance Criteria

- [ ] One of these patterns adopted (pick during implementation):

  **A: Lift focus intent to a single state value.**
  - State: `focusTarget: "input" | "panel" | null`
  - Single effect listens to `focusTarget` changes and calls `.focus()` on the right element
  - Settings close, picker close, window focus all set `focusTarget = "input"`
  - `pendingFocusRef` deleted

  **B: Extract a `<ModalLayer>` component.**
  - `<ModalLayer>` owns settings + picker + their dismiss logic + focus return
  - When closed, calls a prop `onClose(returnFocus: boolean)` and parent handles focus
  - Eliminates the deferred-focus dance because the modal layer waits for its own unmount before returning focus

- [ ] No remaining `pendingFocusRef` (or any similar ref-based deferred-focus pattern) in `App.tsx`
- [ ] All existing focus behaviors preserved:
  - Hotkey re-summon focuses chat input
  - Closing settings (Esc or button) returns focus to chat input
  - Closing picker (Esc or click-outside) returns focus to chat input
  - Window focus from other apps focuses chat input (when settings/picker not open)
  - Tab order within settings/picker is uninterrupted
- [ ] Unit tests in `src/renderer/src/__tests__/App.test.tsx` (existing) cover the focus transitions explicitly
- [ ] Manually tested: open settings → press Esc → focus is on chat input (not on settings button)

## Verification

**Automated (required):** add focus-assertion tests to `App.test.tsx` for each transition listed above. Use `@testing-library/react`'s `expect(element).toHaveFocus()`.

**Ad-hoc:** dev mode walkthrough of each transition. Use Tab to confirm focus is where expected after each modal close.

## Notes

- Pattern A is simpler. Pattern B is more reusable if more modal-style overlays are added later. For V1, recommend A.
- React 19 has improved `useEffect` semantics; verify whether the original `pendingFocusRef` was actually necessary or if it was working around an older issue. May be deletable without replacement in some cases.
- Coordinate with `fix-overlay-blur-hide.md` (in US-v1-hardening) — that task changes when the overlay regains focus. Test focus transitions under both old and new blur behavior.
- Don't over-engineer this. The current code is ~30 lines; the replacement should be ~30 lines too, just clearer.
