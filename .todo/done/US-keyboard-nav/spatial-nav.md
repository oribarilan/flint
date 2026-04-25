# spatial-nav

## Context

Flint's two panels (attention items on the left, suggestion cards on the right) need keyboard navigation. Vim-style `Ctrl+h/j/k/l` provides spatial movement: `j/k` moves within a panel, `h/l` switches between panels.

**Value delivered**: Users can navigate, select, and open items without touching the mouse.

## Related Files

- `src/renderer/src/App.tsx` — owns focus state, keydown handler
- `src/renderer/src/App.module.css` — may need focus indicator styles
- `src/renderer/src/components/AttentionPanel.tsx` — renders attention items
- `src/renderer/src/components/AttentionCard.tsx` — individual card, needs focused state
- `src/renderer/src/components/AttentionCard.module.css` — focus styling
- `src/renderer/src/components/ChatPanel.tsx` — scrollable chat container, needs ref for Ctrl+u/d
- `src/renderer/src/components/ChatEmptyState.tsx` — suggestion cards
- `src/renderer/src/components/ChatEmptyState.module.css` — focus styling
- `src/renderer/src/hooks/useAttention.ts` — attention store hook

## Dependencies

- None (independent of hotkey-hint and slash-to-focus)

## Acceptance Criteria

### Navigation
- [x] `Ctrl+j` moves `focusedIndex` down by 1 in the active panel (clamped, no wrap — no-op at last index)
- [x] `Ctrl+k` moves `focusedIndex` up by 1 in the active panel (clamped, no wrap — no-op at index 0)
- [x] `Ctrl+h` switches `focusedPanel` to `'attention'` (left), resets `focusedIndex` to 0. No-op if attention items list is empty.
- [x] `Ctrl+l` switches `focusedPanel` to `'suggestions'` (right), resets `focusedIndex` to 0. No-op when chat has messages (suggestions not visible).
- [x] When only attention panel is navigable, `Ctrl+j/k` operates on it regardless of `focusedPanel`
- [x] First `Ctrl+j` or `Ctrl+k` press when `focusedPanel` is `null` activates the attention panel at index 0

### Chat scrolling
- [x] `Ctrl+d` scrolls the chat panel down by half the chat container's `clientHeight`
- [x] `Ctrl+u` scrolls the chat panel up by half the chat container's `clientHeight`
- [x] Scrolling is smooth (`behavior: 'smooth'`) but respects `prefers-reduced-motion` (instant if reduced)
- [x] Works regardless of `focusedPanel` state — always scrolls chat when chat has messages
- [x] No-op when chat is empty (showing suggestions)
- [x] ChatPanel exposes a scroll ref via `forwardRef` so App.tsx can call `scrollBy()` on the chat container

### Actions (only when `focusedPanel` is not `null`)
- [x] `Space` on a focused attention item toggles its selection (calls `toggleSelect(id)`)
- [x] `Enter` on a focused attention item opens it (calls `onOpen(id)`)
- [x] `Enter` on a focused suggestion card sends it as a chat prompt (calls `onSend(title)`)
- [x] `SUGGESTIONS` array is exported from ChatEmptyState (or extracted to a shared module) so App.tsx can resolve `focusedIndex` → suggestion title
- [x] `Space`/`Enter` are NOT intercepted when `focusedPanel` is `null` — they pass through to normal behavior (chat input, card native handlers, etc.)

### Visual
- [x] Focused item gets a `.keyboardFocused` class with `--bg-hover` background
- [x] No CSS transition on the focus indicator (keyboard-driven state rule)
- [x] Focus scrolls the item into view if needed
- [x] Focus indicator is cleared when the user clicks anywhere (mouse takes over)
- [x] Focus indicator is cleared when the chat input gains focus (typing mode)

### State
- [x] `focusedPanel` state: `'attention' | 'suggestions' | null` — `null` means no keyboard focus active
- [x] `focusedIndex` state: `number` — index within the active panel's item list
- [x] Focus state resets to `null` when the overlay hides (reset in the Escape handler before calling `hideOverlay()`, which is the only renderer-initiated hide path; blur-initiated hides from main process don't need reset since the renderer remounts on next show)
- [x] Focus state adapts when items change (e.g., attention items update from IPC — clamp index to new bounds)

### Integration
- [x] `Ctrl+h/j/k/l` handlers added to App.tsx's keydown useEffect, after escape stack, before `/` handler
- [x] `preventDefault` and `stopPropagation` on handled keys to avoid browser defaults (e.g., `Ctrl+H` = history on some platforms)
- [x] Focused panel/index passed as props to `AttentionPanel` and `ChatEmptyState` (or via a shared context)

### Tests
- [x] `Ctrl+j` moves focus down, `Ctrl+k` moves focus up (clamped)
- [x] `Ctrl+h` switches to attention, `Ctrl+l` switches to suggestions
- [x] `Ctrl+d` scrolls chat down, `Ctrl+u` scrolls chat up
- [x] `Space` toggles selection on focused attention item
- [x] `Enter` opens focused attention item
- [x] `Enter` sends focused suggestion
- [x] Focus clears on mouse click
- [x] `Ctrl+h/l` is no-op when chat has messages

## Verification

- **Automated**: Unit tests for navigation state transitions, action dispatch, and edge cases
- **Ad-hoc**: `just check` passes. Manual: `Ctrl+j/k` highlights items, `Space` selects, `Enter` opens.

## Notes

The suggestion cards in `ChatEmptyState` are a flat list (4 items). `j/k` navigates them linearly regardless of visual grid layout.

AttentionCard already has `tabIndex={0}` and handles `Enter`/`Space` via its own `onKeyDown`. The new system should NOT conflict — the `Ctrl+` prefix keeps the shortcuts separate from the card's native keyboard handling. When using `Ctrl+j/k` navigation, the DOM focus stays on `document` (or the App root), not on individual cards. The focused state is tracked in React state, not via DOM focus.

**Known divergence**: AttentionCard's native `handleCardKeyDown` maps both `Enter` and `Space` to `onSelect` (toggle selection). The spatial-nav system maps `Space` → select, `Enter` → open. These don't conflict (different focus mechanisms), but the inconsistency may confuse users who switch between Tab-nav and Ctrl-nav. Consider aligning AttentionCard's native handlers as a follow-up.
