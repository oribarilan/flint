# fix-two-writer-attention-store

## Context

`AttentionStore` (`src/main/attention/store.ts`) has two writers and no merge protocol:

1. **Monitor session** calls `set_attention_items` during background polls (every 10–30 min, more often on aggressive)
2. **Chat session** calls `set_attention_items` whenever the user asks a question that triggers it (system prompt: *"When showing calendar events or work items, always populate the attention panel with set_attention_items"*)

Both go through `tools.ts:296-300`:
```ts
handler: async (args) => {
  const { items } = args as { items: AttentionItem[] };
  callbacks.onAttentionUpdate(items);  // FULL REPLACE
  return "ok";
}
```

The handler does a **full replace** of the entire item list.

**Concrete failure case**: User opens overlay, asks "what's on my calendar today?" → 6 meetings appear in the panel → 30 seconds later the monitor wakes up, decides 5 emails are more important right now → calls `set_attention_items` with email candidates → **the 6 meetings vanish from the panel mid-glance**.

The monitor's system prompt says "preserve unchanged ones, don't churn" — but preservation is enforced by a 600-char English string, not by code. The LLM will get this wrong, drift IDs, and occasionally drop the meeting starting in 4 minutes because it's "preserving."

The right factoring (council unanimous): **LLM proposes candidates, deterministic code reconciles**. Each item gets an `owner: "monitor" | "chat"` tag; replace is per-owner; the unified list is the merge of both owners.

**Value delivered**: Eliminates the most user-visible race condition the system can produce. Lets both sessions coexist safely — a precondition for any V1 that keeps the LLM-monitor.

## Related Files

- `src/main/attention/store.ts` — currently 19 LOC; gains merge logic
- `src/main/copilot/tools.ts:256-301` — `set_attention_items` tool definition and handler
- `src/main/types.ts:44-55` — `AttentionItem` interface; needs `owner` field
- `src/main/index.ts:128-136` — `onAttentionUpdate` callback wiring
- `src/main/__tests__/attention-store.test.ts` — needs new merge tests
- Renderer-side display order (e.g., `AttentionPanel.tsx`) — may need stable sort

## Dependencies

- `decide-v1-mission-scope.md` (P0) — if pull-only V1 is chosen, this task simplifies to "add owner field for future-proofing" or may be skipped entirely

## Acceptance Criteria

- [ ] `AttentionItem` interface in `src/main/types.ts` gains `owner: "monitor" | "chat"` field (required, no default — must be set at write site)
- [ ] `AttentionStore` interface gains `applyCandidates(items: AttentionItem[], owner: "monitor" | "chat"): void` method; existing `setItems` either removed or marked internal
- [ ] `applyCandidates(items, owner)` semantics: removes all current items with matching `owner`, adds the new items (also tagged with `owner`). Items from the other owner are untouched.
- [ ] Two distinct tool factory functions or two configurations: monitor-side `set_attention_items` calls `applyCandidates(items, "monitor")`; chat-side calls `applyCandidates(items, "chat")`. The `owner` is set by the handler, NOT trusted from LLM input.
- [ ] Renderer display order is stable across owner-scoped updates (don't visually reshuffle items just because the other owner wrote)
- [ ] Unit tests in `src/main/__tests__/attention-store.test.ts` covering:
  - Monitor writes 3 items, chat writes 2 items → store has 5 items
  - Monitor re-writes with 2 different items → store has 4 items (chat's 2 preserved, monitor's 3 replaced by 2)
  - Chat clears (writes empty) → only monitor items remain
  - Display order is deterministic
- [ ] Integration test simulating the failure case: chat populates 6 items → monitor poll fires with 2 items → assert all 8 items present

## Verification

**Automated (required):** unit and integration tests above. Must run as part of `just check`.

**Ad-hoc:** with real Work IQ wired, manually trigger the failure case — ask a question that populates the panel, wait for the next poll, confirm chat items are still there.

## Notes

- Owner is set by the **handler factory**, not passed by the LLM. The chat session's tool factory closes over `owner: "chat"`; the monitor session's over `owner: "monitor"`. This means `getChatTools` and `getMonitorTools` in `tools.ts` will diverge slightly and the `set_attention_items` schema does NOT include an `owner` field exposed to the LLM.
- Open question: should chat-owner items expire? E.g., if user asked about meetings at 9:00 AM, do those cards stay until 5:00 PM? Recommended default: chat items persist until the user starts a new chat (`Cmd+N` clears chat-owner items; monitor items unaffected). Capture this in the implementation.
- Display order: prefer "monitor first, then chat" or interleave by `timestamp` if present. Pick one and document.
- This task may also surface the need for an `owner` indicator in the UI (subtle dot or badge showing "from monitor" vs "from your question"). Defer that to `US-polish-refactor` unless it's needed for the merge to feel right.
