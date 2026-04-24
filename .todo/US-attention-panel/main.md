# US-attention-panel

## Goal

Replace the hardcoded meeting list in the left panel with a generic, agent-controlled "attention panel." The Copilot agent decides what to show (meetings, Teams messages, emails, documents) and pushes items via a `set_attention_items` tool. Each item renders as a uniform card with icon, title, description, select, and open actions. Selecting a card injects its context into the next chat message as a hidden prefix.

## Definition of Done
- [ ] The left panel renders generic `AttentionCard` components instead of `MeetingCards`
- [ ] The agent can call `set_attention_items` tool and items appear in the panel immediately
- [ ] Each card shows icon, title, description, Select button, and Open button (when `openAction` is present)
- [ ] Clicking Select highlights the card and shows a "With: ..." indicator near the chat input
- [ ] Multiple cards can be selected simultaneously
- [ ] Sending a chat message with selected cards prepends hidden context (title + description + metadata) to the prompt
- [ ] Clicking Open calls the `openAction` (opens URL in browser)
- [ ] Items are grouped by time with visual separators (day separators or similar — see `showcases/attention-time-showcase.html` for options)
- [ ] Empty state shows "No items yet" message
- [ ] All existing unit tests still pass (`just test`)
- [ ] Build passes (`just build`)

## Task Priority
1. `attention-data-model.md` — types, IPC channels, main process store, `set_attention_items` tool
2. `attention-ui.md` — AttentionCard component, AttentionPanel, selection, time grouping
3. `attention-context-injection.md` — wire selection into chat prompt, hidden prefix, "With: ..." indicator
4. `attention-cleanup.md` — remove old MeetingCards, MeetingDetail, meetingStore, useMeetings; update system prompt

## Cross-Cutting Concerns
- The `AttentionItem` type must be defined once in `src/main/types.ts` and imported by both main and renderer
- The `set_attention_items` tool lives on the **chat session** (not monitor) so the agent can update the panel during conversation
- The monitor's `report_meetings` handler should convert meetings to `AttentionItem[]` and push them via the same IPC channel
- Time grouping visual style: reference `showcases/attention-time-showcase.html` for design options (day separators recommended)
- Performance: attention items are pushed from main → renderer via IPC. No network calls on overlay show.
