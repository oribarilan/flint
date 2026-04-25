# contextual-suggestions

## Context

`ChatEmptyState.tsx` currently shows a hardcoded `SUGGESTIONS` array — the same 4 cards every time. This task makes those suggestions context-aware: when attention data is available in the renderer, suggestions adapt. The existing static suggestions become the fallback when no data is available. One system, not two.

**Value delivered**: Suggestions feel personal and timely instead of generic. Users see the most relevant action for their current moment.

## Related Files

- `src/renderer/src/utils/suggestions.ts` — new module (buildSuggestions pure function)
- `src/renderer/src/components/ChatEmptyState.tsx` — integrate buildSuggestions
- `src/renderer/src/stores/attentionStore.ts` — read attention items
- `src/main/types.ts` — `AttentionItem` type

## Dependencies

- `pulse-scheduler.md` (attention items must be populated by Pulse for contextual suggestions to appear)

## Acceptance Criteria

- [ ] `buildSuggestions(items: AttentionItem[]): Suggestion[]` is a pure function in `src/renderer/src/utils/suggestions.ts`
- [ ] Maps attention items to suggestions by `icon` type: `calendar` → "Prepare me for [title]", `mail` → "Summarize email from [description]", `message-circle` → "Catch up on [title]"
- [ ] Unmapped icon types (e.g. `file-text`, `alert-triangle`) are skipped
- [ ] Contextual cards capped at 3
- [ ] Remaining slots filled with static defaults using category-based dedup: each static has a category tag, contextual cards declare which category they replace, covered categories are skipped
- [ ] Always returns 3–4 cards total. Never scrolls.
- [ ] Visual treatment: seamless — contextual cards identical to static ones. Only text changes.
- [ ] `ChatEmptyState` reads from attention store and calls `buildSuggestions` — no new IPC, no network, no disk I/O
- [ ] Unit tests cover: no items → defaults, calendar item → contextual + fill, mail item → email suggestion, 3+ contextual → cap + 1 static, unmapped icon → skipped, category dedup
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests for `buildSuggestions` pure function covering all cases above
- **Ad-hoc**: `just check` passes; visual confirmation with mock attention data in dev mode
