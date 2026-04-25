# US-chat-empty-state

## Goal
Replace the blank chat panel with a guided empty state that helps users discover what Flint can do. Uses the "Guide" layout (validated in `showcases/chat-empty-state-showcase.html` — variant C): time-aware greeting, vertical suggestion cards with icons and descriptions, and click-to-send behavior.

## Definition of Done
- [ ] When no messages exist and chat is not streaming, the chat panel shows the Guide empty state instead of blank space
- [ ] Clicking a suggestion card sends the message immediately (calls `sendMessage`, not just fills input)
- [ ] The empty state disappears as soon as the first message is sent
- [ ] `just check` passes (lint, format, typecheck, test)

## Task Priority
1. `chat-empty-state.md` — ships the full feature with static suggestions
2. `contextual-suggestions.md` — enhances suggestions based on live meeting data (independent follow-up)

## Cross-Cutting Concerns
- **Performance**: the empty state is on the overlay-ready critical path. It must render from static data only — no network, no IPC, no disk I/O. The suggestion list is hardcoded in the component.
- **Design tokens**: all styling via semantic tokens from `global.css`. No hardcoded colors or spacing. Follow `specs/design.md` "Guided empty states" signature element.
- **Accessibility**: suggestion cards must be keyboard-navigable, have proper ARIA roles, and visible focus states.
- The `onSend` callback comes from `useChat` hook via `App.tsx` — same path as `ChatInput`.

## References
- Design spec (empty states): `specs/design.md` lines 344–355
- Showcase: `showcases/chat-empty-state-showcase.html` (variant C — "Guide")
- Current ChatPanel: `src/renderer/src/components/ChatPanel.tsx` (returns `null` when empty)
- Chat hook: `src/renderer/src/hooks/useChat.ts`
