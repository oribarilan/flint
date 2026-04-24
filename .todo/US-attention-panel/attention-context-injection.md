# Task: attention-context-injection

## Context
Wire card selection into the chat flow. When the user sends a message with cards selected, prepend a hidden context prefix containing the selected items' title, description, and metadata. Show a "With: ..." indicator near the chat input.

**Value delivered**: The agent receives contextual information about what the user is looking at, enabling relevant responses without the user having to describe the items.

## Related Files
- `src/renderer/src/hooks/useChat.ts` — modify `sendMessage` to prepend context
- `src/renderer/src/stores/attentionStore.ts` — read selectedIds
- `src/renderer/src/components/ChatInput.tsx` — show "With: ..." indicator
- `src/renderer/src/components/ChatInput.module.css` — style the indicator

## Dependencies
- `attention-ui.md` — needs attentionStore with selection state

## Acceptance Criteria
- [ ] When sending a chat message with selected cards, the prompt sent to main process is prefixed with: `[Context — selected items:\n- {icon} {title}: {description}. {metadata key=value pairs}\n]\n\n{user message}`
- [ ] The user sees only their own message in the chat history (prefix is hidden)
- [ ] The chat input area shows "With: Title1, Title2" below the input when items are selected (comma-separated, truncated at 3 items with "..." for more)
- [ ] The indicator disappears when no items are selected
- [ ] Selection is NOT cleared after sending a message (user may ask follow-ups)
- [ ] Build passes, existing chat tests still pass

## Verification
- **Automated**: unit test verifying context prefix format in `src/renderer/src/hooks/__tests__/useChat.test.ts`
- **Ad-hoc**: `npx electron-vite build` succeeds

## Scope Estimate
Small
