# Task: attention-data-model

## Context
Define the `AttentionItem` type, IPC channels, main process store, and `set_attention_items` Copilot tool. This is the backend foundation for the attention panel — everything else builds on these types and interfaces.

**Value delivered**: The agent can call `set_attention_items` and the items are stored in main process and pushed to the renderer via IPC. The renderer can retrieve items via `attention:get`.

## Related Files
- `src/main/types.ts` — add `AttentionItem` type
- `src/main/ipc/channels.ts` — add `attention:update`, `attention:get`, `attention:open`
- `src/main/ipc/handlers.ts` — register new handlers
- `src/preload/index.ts` — expose new IPC methods on `window.flint`
- `src/renderer/src/lib/ipc.ts` — update `FlintAPI` type
- `src/main/copilot/tools.ts` — add `set_attention_items` tool
- `src/main/index.ts` — wire tool callback to IPC push

## Dependencies
- None

## Acceptance Criteria
- [ ] `AttentionItem` interface exists in `src/main/types.ts` with fields: `id`, `icon`, `title`, `description`, `openAction?` (`{ type: 'url', url: string }`), `metadata` (`Record<string, string>`), `timestamp?` (ISO string for time grouping)
- [ ] `IPC_CHANNELS` has `ATTENTION_UPDATE`, `ATTENTION_GET`, `ATTENTION_OPEN`
- [ ] Main process stores `AttentionItem[]` in memory, accessible via `attention:get`
- [ ] `attention:update` pushes items to renderer when store changes
- [ ] `attention:open` handler opens the item's URL via `shell.openExternal`
- [ ] Preload exposes `getAttentionItems()`, `onAttentionUpdate()`, `openAttentionItem(id)`
- [ ] `set_attention_items` tool exists with typed schema matching `AttentionItem[]`
- [ ] Tool handler stores items and triggers IPC push to renderer
- [ ] Unit tests for the attention store (CRUD, push on update)
- [ ] Build passes

## Verification
- **Automated**: unit test for attention store in `src/main/__tests__/attention-store.test.ts`
- **Ad-hoc**: `npx electron-vite build` succeeds, `npx vitest run` passes

## Scope Estimate
Medium
