# slash-to-focus

## Context

Users need a fast way to jump to the chat input from anywhere in the overlay. `/` is the standard shortcut for this in Slack, Discord, and other keyboard-driven apps.

**Value delivered**: One-keystroke access to the chat input from any state.

## Related Files

- `src/renderer/src/App.tsx` — keydown handler, needs chat input ref access
- `src/renderer/src/components/ChatInput.tsx` — the input element to focus
- `src/renderer/src/components/ChatInput.module.css` — placeholder styling

## Dependencies

- None (can be built in parallel with hotkey-hint)

## Acceptance Criteria

- [ ] Pressing `/` when no text input has focus calls `focus()` on the chat input and prevents the `/` from being typed
- [ ] Pressing `/` when the chat input already has focus types a literal `/` (no interception)
- [ ] Pressing `/` when any other input/textarea/contenteditable has focus types a literal `/` (no interception)
- [ ] The chat input placeholder text includes a `/` hint at the end (e.g., `"Ask Flint anything…  /"`)
- [ ] The `/` handler is added to App.tsx's existing `keydown` useEffect, after the escape stack and before the pass-through
- [ ] Chat input exposes a ref or imperative handle so App.tsx can call `focus()` on it
- [ ] Unit tests: `/` focuses chat input when nothing focused, `/` is ignored when input already focused, placeholder text includes hint

## Verification

- **Automated**: Unit tests for focus behavior and input guard
- **Ad-hoc**: `just check` passes. Manual test: press `/` from attention panel, verify chat input gains focus.

## Notes

The chat input currently has `autoFocus` on mount. The `/` shortcut is for returning focus after the user has navigated away (e.g., to attention items).

For the ref, either lift the input ref up via `forwardRef` on `ChatInput`, or use a callback ref passed as a prop. `forwardRef` is cleaner.
