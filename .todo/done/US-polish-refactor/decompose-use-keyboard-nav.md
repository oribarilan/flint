# decompose-use-keyboard-nav

## Context

`src/renderer/src/hooks/useKeyboardNav.ts` is 225 LOC, dominated by one giant `useEffect` (`:92-222`) with deep branching for Ctrl+H/J/K/L spatial nav, Ctrl+U/D chat scroll, Space/Enter actions, and panel state transitions. Single responsibility is violated — this one hook owns three distinct concerns:

1. **Spatial navigation** between attention panel and suggestion cards (Ctrl+H/J/K/L)
2. **Chat scrolling** (Ctrl+U/D)
3. **Item activation** (Space/Enter on focused items)

Plus secondary effects (clear-on-mouse-click, clear-on-input-focus, scroll-into-view) that span all three.

Symptoms today:
- The 30-line dependency array (`:210-222`) means the effect re-binds on nearly every render
- New keyboard interactions require touching the megafunction
- Branching like "if items empty, switch to suggestions" is duplicated in multiple places
- Tests (`useKeyboardNav.test.ts`, 605 LOC) stress every interaction in one suite

**Value delivered**: Three focused hooks each <100 LOC. Each independently testable. Future keyboard additions land cleanly.

## Related Files

- `src/renderer/src/hooks/useKeyboardNav.ts` — to decompose
- `src/renderer/src/hooks/__tests__/useKeyboardNav.test.ts` — to split alongside
- `src/renderer/src/App.tsx:37-48` — caller
- `src/renderer/src/App.tsx:62-108` — additional global shortcut handling that probably belongs in the new global-shortcuts hook

## Dependencies

None. Best done after `simplify-app-focus-orchestration.md` if both happen, but order is flexible.

## Acceptance Criteria

- [ ] Three new hooks created:
  - `useSpatialNav({ items, suggestions, hasMessages, isStreaming, disabled, chatInputRef, toggleSelect, onOpen, sendMessage })` — owns Ctrl+H/J/K/L, Space, Enter
  - `useChatScrollKeys({ chatPanelRef, hasMessages, disabled })` — owns Ctrl+U/D
  - `useGlobalShortcuts({ ... })` — owns Cmd+,, Cmd+N, Esc, `/` (the shortcuts currently inline in `App.tsx`)
- [ ] Each new hook is <100 LOC
- [ ] Each new hook has its own test file in `src/renderer/src/hooks/__tests__/`
- [ ] `useKeyboardNav` either deleted or becomes a thin composer that calls the three new hooks (preferred: delete, call the three directly from `App.tsx`)
- [ ] `App.tsx` imports the three hooks individually; the inline `useEffect` for global shortcuts (`App.tsx:62-108`) is removed in favor of `useGlobalShortcuts`
- [ ] Existing keyboard behaviors all preserved: Ctrl+H/J/K/L navigation, Ctrl+U/D scroll, Space=select, Enter=open/send-suggestion, Cmd+N=new chat, Cmd+,=settings, /=focus input, Esc=hide
- [ ] `keyboardFocusedIndex` state still works — either lifted to `App.tsx` or owned by `useSpatialNav` and exposed to consumers
- [ ] Existing E2E tests (if any) for keyboard navigation still pass
- [ ] All unit tests pass; new hooks have ≥90% line coverage

## Verification

**Automated (required):** the existing 605-LOC test suite must split alongside the hooks; combined tests pass `just check`.

**Ad-hoc:** in dev mode, exercise every keyboard shortcut. Specifically:
- Ctrl+J/K within attention panel
- Ctrl+L to jump to suggestions (when chat empty)
- Ctrl+H to jump back
- Ctrl+U/D scrolls chat after sending messages
- Space toggles selection
- Enter opens / sends suggestion
- Cmd+N clears chat
- Cmd+, opens settings
- `/` focuses input from any non-input focus
- Esc closes settings/picker/overlay in priority order

## Notes

- This is structural refactoring; behavior must be identical. Any behavior change is a bug.
- The Ctrl+H/Ctrl+D conflict with macOS emacs bindings inside text inputs (flagged by claude in the review) is NOT in scope for this task — capture as a follow-up if discovered. This task only restructures, doesn't redesign.
- Consider whether `keyboardFocusedIndex` and `focusedPanel` should live in a Zustand store rather than be returned from the hook — defer that decision unless it simplifies the App.tsx interface.
- Also see `simplify-app-focus-orchestration.md` — focus management ties into keyboard nav; coordinate.
