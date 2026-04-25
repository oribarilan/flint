# contextual-suggestions

## Context
`ChatEmptyState.tsx` currently shows a hardcoded `SUGGESTIONS` array — the same 4 cards every time. This task makes those suggestions context-aware: when meeting data is available in the renderer, the suggestions adapt. For example, if "Design Review" starts in 10 minutes, show "Prepare me for Design Review" instead of the generic "Prepare me for my next meeting."

The existing static suggestions become the fallback when no meeting data is available. One system, not two.

**Value delivered**: Suggestions feel personal and timely instead of generic. Users see the most relevant action for their current moment.

## Related Files
- `src/renderer/src/components/ChatEmptyState.tsx` — current component with static `SUGGESTIONS`
- `src/renderer/src/hooks/useAttention.ts` — attention items from main process
- `src/main/types.ts` — `AttentionItem` types

## Dependencies
- None

## Acceptance Criteria
- [ ] When no attention items exist, the current static suggestions are shown unchanged
- [ ] When a meeting is within 15 minutes, a contextual suggestion appears: "Prepare me for [meeting title]" with the meeting's actual title
- [ ] When today has 3+ meetings, "Summarize today's schedule" is promoted to first position
- [ ] Suggestions are derived from existing renderer state only — no new IPC calls or network requests (overlay-ready critical path preserved)
- [ ] Suggestion generation is a pure function: `buildSuggestions(items: AttentionItem[]) → Suggestion[]` — extracted to a utility for testability
- [ ] Unit tests cover: no items → defaults, imminent meeting → contextual card, busy day → reordered
- [ ] `just check` passes

## Verification
- **Automated**: unit tests for `buildSuggestions` pure function
  - Empty items → returns default static suggestions
  - Item with `startTime` within 15 min → returns contextual "Prepare me for [title]" card
  - 3+ items today → "Summarize today's schedule" promoted to position 0
- **Ad-hoc**: `just check` passes; visual confirmation with mock attention data in dev mode

## Notes
- `buildSuggestions` should live in `src/renderer/src/utils/suggestions.ts`.
- The attention items are already pushed to the renderer via IPC — no new data flow needed.
