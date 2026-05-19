# Block Rendering System

## Context

Introduce the typed block protocol that powers the Fluid Pill's content. Define the `FlintBlock` discriminated union, Zod validation schemas, block registry, block renderer, and `PillState` derivation. Refactor existing briefing content (meetings, attention items) to render as block components. Add `blocks:update` and `blocks:action` IPC channels.

**Value delivered**: The renderer has a typed, extensible block system. Briefing views use block components composed from cache. IPC infrastructure is ready for AI-produced blocks. Pill state morphs based on active block type.

## Related Files

- `src/main/types.ts` — existing `Meeting`, `AttentionItem` types (block data contracts extend these)
- `src/main/ipc/channels.ts` — IPC channel constants (add `BLOCKS_UPDATE`, `BLOCKS_ACTION`)
- `src/main/ipc/handlers.ts` — IPC handlers (add `blocks:action` handler with allowlist)
- `src/preload/index.ts` — preload API (add `onBlocksUpdate`, `sendBlocksAction`)
- `src/main/lib/schemas.ts` — existing Zod schemas (add block schemas)
- `src/renderer/src/App.tsx` — root layout, integrate block renderer
- `src/renderer/src/components/MeetingRow.tsx` — existing component, reused inside `MeetingList` block
- `src/renderer/src/components/AttentionRow.tsx` — existing component, reused inside `AttentionList` block

## Dependencies

- `1-pill-container.md` — pill shape must exist so block types can drive pill state morphing

## Acceptance Criteria

### Types & Validation

- [x] `FlintBlock` discriminated union type defined (shared between main and renderer):
  ```
  meeting-list | meeting-card | attention-list | action-confirmation | chat-message | suggestion-chips
  ```
- [x] `MeetingCardData` interface defined (extends `Meeting` with optional `aiPrep: string[]`)
- [x] `ActionConfirmData` interface defined (`action`, `label`, `status: 'pending' | 'done'`)
- [x] `SuggestionChip` interface defined (`label`, `prompt`)
- [x] `PillState` type defined: `'briefing' | 'meeting-focus' | 'action-confirm' | 'chat'`
- [x] Zod schemas defined for each block type; parse-don't-validate at IPC boundary
- [x] Invalid blocks rejected with structured `[blocks]` log warnings

### Block Rendering

- [x] Block registry maps `type` string to React component
- [x] `BlockRenderer` component accepts `FlintBlock` and renders the correct component
- [x] Briefing view composes `MeetingList` + `AttentionList` + `SuggestionChips` blocks from Zustand stores
- [x] `MeetingList` block wraps existing `MeetingRow` components
- [x] `AttentionList` block wraps existing `AttentionRow` components
- [x] `SuggestionChips` component renders hardcoded chips per pill state
- [x] Clicking a suggestion chip sends its `prompt` to `chat:send`
- [x] "Back" chip clears active AI block (returns to briefing)

### State Derivation

- [x] `derivePillState(activeBlock, isStreaming)` function implemented per spec in main.md
- [x] Pill container reads state from derivation function and morphs width/radius accordingly
- [x] Pill morphs correctly between all four states (briefing, meeting-focus, action-confirm, chat)

### IPC

- [x] `BLOCKS_UPDATE` and `BLOCKS_ACTION` added to `IPC_CHANNELS`
- [x] `blocks:update` channel added to preload API (`onBlocksUpdate` callback)
- [x] `blocks:action` channel added to preload API (`sendBlocksAction` method)
- [x] `blocks:action` handler on main process validates action type against allowlist (`join`, `dismiss`, `open`)
- [x] Unknown action types rejected with structured `[ipc]` log warning
- [x] `join` action validates URL against cached meeting data before opening
- [x] Existing `attention:update` and `chat:delta` channels unchanged and functional

### Zustand Store

- [x] `blockStore.ts` created with `activeBlock: FlintBlock | null`, `previousPillState: PillState`
- [x] `setActiveBlock(block)` stores previous state before setting new block
- [x] `clearActiveBlock()` resets to null (returns to briefing)
- [x] Active block cleared when user sends a new message
- [x] Active block cleared when overlay is hidden

### Tests

- [x] Unit tests for `derivePillState` covering all state mappings and edge cases
- [x] Unit tests for Zod schema validation (valid payloads, invalid payloads, partial payloads)
- [x] Unit tests for block registry (known types resolve, unknown types handled)
- [x] Unit tests for `blocks:action` allowlist enforcement
- [x] Render tests for `MeetingList`, `AttentionList`, `SuggestionChips` block components
- [x] Existing tests pass (`just test`)

### Performance

- [x] Overlay-ready path unchanged: briefing blocks composed from cache stores, no new async work, no network, no disk

## Verification

- **Automated**: `just check` — lint, format, typecheck, and all tests pass
- **Ad-hoc**: `just dev` → summon overlay → verify briefing renders meetings and attention as block components
- **Ad-hoc**: Verify suggestion chips appear below meetings/attention, above input
- **Ad-hoc**: Click a suggestion chip → verify message sent to chat
- **Ad-hoc**: Click "Back" chip (when in a non-briefing state) → verify return to briefing

## Notes

- Block components reuse existing CSS modules and design tokens. `MeetingList` is a thin wrapper around `MeetingRow`. `AttentionList` wraps `AttentionRow`. No visual redesign in this task.
- `SuggestionChips` are not a "block" in the IPC sense — they're a UI-only component driven by pill state. They don't flow through `blocks:update`.
- The `previousPillState` in the block store enables ActionConfirmation (task 3) to return to the right state after auto-dismiss, not always briefing.
- The `blocks:action` allowlist is: `join` (open meeting URL), `dismiss` (clear active block), `open` (open attention item URL). More actions added as needed in future stories.
- Keep the `FlintBlock` types in a shared location importable by both main and renderer (e.g., `src/shared/blocks.ts` or extend `src/main/types.ts` — follow existing project conventions).
