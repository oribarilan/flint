# contextual-suggestions

## Context
The base empty state (`chat-empty-state.md`) ships with static suggestion cards. This task makes them context-aware: when the meeting cache has data, suggestions adapt to what's actually happening. For example, if a meeting is imminent, surface "Prepare me for Design Review" instead of the generic "Prepare me for my next meeting."

**Value delivered**: Suggestions feel personal and timely instead of generic. Users see the most relevant action for their current moment.

## Related Files
- `src/renderer/src/components/ChatEmptyState.tsx` — base component from task 1
- `src/renderer/src/stores/meetingStore.ts` — Zustand store with meeting data (if exists)
- `src/renderer/src/hooks/useAttention.ts` — attention items from main process
- `src/main/types.ts` — `Meeting` and `AttentionItem` types

## Dependencies
- `chat-empty-state.md` must be completed first

## Acceptance Criteria
- [ ] When no meetings exist in the store, the static default suggestions are shown (same as task 1)
- [ ] When a meeting is within 15 minutes, a contextual suggestion appears: "Prepare me for [meeting title]" with the meeting's actual title
- [ ] When today has 3+ meetings, a "Summarize today's schedule" suggestion is promoted to first position
- [ ] Contextual suggestions are derived from the existing meeting/attention data already in the renderer — no new IPC calls or network requests
- [ ] Suggestion generation is a pure function: `buildSuggestions(items: AttentionItem[]) → Suggestion[]` — testable in isolation
- [ ] Unit tests cover: no meetings → defaults, imminent meeting → contextual card, many meetings → reordered
- [ ] `just check` passes

## Verification
- **Automated**: unit tests for `buildSuggestions` pure function
  - Empty items → returns default static suggestions
  - Item with `startTime` within 15 min → returns contextual "Prepare me for [title]" card
  - 3+ items today → "Summarize today's schedule" promoted to position 0
- **Ad-hoc**: `just check` passes; visual confirmation with mock meeting data in dev mode

## Notes
- This reads from existing renderer state only — the overlay-ready critical path is maintained.
- `buildSuggestions` should be extracted to a utility file (e.g., `src/renderer/src/utils/suggestions.ts`) for testability.
- The attention items are already pushed to the renderer via `meetings:update` IPC — no new data flow needed.
