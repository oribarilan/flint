# chat-empty-state

## Context
The chat panel currently returns `null` when there are no messages, leaving the right side of the overlay blank except for the input bar. The design spec explicitly calls for "Welcome + suggested prompts or ghost text" in this state. The "Guide" variant was chosen from the showcase — a time-aware greeting with vertical suggestion cards.

**Value delivered**: First-time and returning users see actionable suggestions instead of a void. Clicking a suggestion starts a conversation immediately, reducing friction to zero.

## Related Files
- `src/renderer/src/components/ChatPanel.tsx` — currently returns `null` when empty
- `src/renderer/src/components/ChatPanel.module.css` — chat panel styles
- `src/renderer/src/App.tsx` — composes ChatPanel + ChatInput, needs to pass `onSend`
- `src/renderer/src/hooks/useChat.ts` — provides `sendMessage`
- `src/renderer/src/styles/global.css` — design tokens

## Dependencies
- None

## Acceptance Criteria
- [ ] New `ChatEmptyState` component exists at `src/renderer/src/components/ChatEmptyState.tsx` with its CSS module
- [ ] Shows a time-aware greeting: "Good morning" / "Good afternoon" / "Good evening" based on current hour
- [ ] Shows a subtitle: "I can help you stay on top of your day. Try asking about:"
- [ ] Shows 4 suggestion cards, each with: icon (emoji for now, Lucide later), title (the prompt text), and a short description
- [ ] Suggestion cards are `<button>` elements with `role` semantics, keyboard-navigable via Tab
- [ ] Clicking a suggestion card calls `onSend(promptText)` — sends the message immediately, does not fill the input
- [ ] `ChatPanel` renders `ChatEmptyState` instead of returning `null` when `messages.length === 0 && !isStreaming`
- [ ] `App.tsx` passes `sendMessage` to `ChatPanel` (or directly to `ChatEmptyState`) as the `onSend` prop
- [ ] Empty state disappears once `messages.length > 0` or `isStreaming` becomes true
- [ ] All CSS uses design tokens — no hardcoded colors, spacing, font sizes, or radii
- [ ] Focus-visible states on suggestion cards use `--accent` outline per spec
- [ ] Hover state on cards uses `--bg-hover`, no opacity changes
- [ ] Unit tests cover: rendering with greeting, click calls onSend with correct text, time-aware greeting logic (morning/afternoon/evening)
- [ ] `just check` passes

## Suggestion Cards

| Icon | Title | Description |
|------|-------|-------------|
| 📅 | What are my next meetings? | See upcoming meetings, times, and attendees |
| 📋 | Prepare me for my next meeting | Get agenda, attendee context, and talking points |
| ⚠️ | Any conflicts this week? | Find overlapping or back-to-back meetings |
| 📊 | Summarize today's schedule | Quick overview of your day at a glance |

## Verification
- **Automated**: unit tests in `src/renderer/src/components/__tests__/ChatEmptyState.test.tsx`
  - Renders greeting, subtitle, and all 4 suggestion cards
  - `onSend` is called with the correct prompt string when a card is clicked
  - Greeting changes based on mocked time (morning < 12, afternoon 12–17, evening ≥ 17)
- **Ad-hoc**: `just check` passes; visual confirmation in dev mode (`just dev`)

## Notes
- Suggestion data is hardcoded in the component — no network or IPC calls. This is critical for the overlay-ready performance path.
- Icons are emoji for now. If `US-ui-refinements/lucide-icons.md` lands first, use Lucide icons instead.
- The time-aware greeting uses `new Date().getHours()` inline — no need for a custom hook since the overlay is short-lived (hidden on blur).
