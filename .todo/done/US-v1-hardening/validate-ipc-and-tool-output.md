# validate-ipc-and-tool-output

## Context

Several trust boundaries currently accept un-validated input:

1. **`config:set` IPC** (`src/main/config.ts:68-74`) — accepts any partial keys, writes them to disk via `electron-store`. The renderer can write arbitrary fields. Reads validate (whitelist of valid font sizes, themes); writes do not.
2. **`chat:send` IPC** (`src/main/index.ts:166`) — accepts `prompt: string` with no length cap, no type guard at runtime.
3. **`set_attention_items` LLM tool** (`src/main/copilot/tools.ts:296-300`) — receives LLM-generated objects, casts as `AttentionItem[]`, passes to store. No runtime schema validation. The LLM can produce malformed items that crash the renderer.
4. **`AttentionStore.getAll()`** returns the internal array by reference (`src/main/attention/store.ts:13`) — caller mutations mutate the store. Renderer-side mutation hazard.

Two trust boundaries: renderer→main (for IPC) and LLM→main (for tool output). Both flow into UI rendering and side-effect actions. Both deserve schema validation.

**Value delivered**: Closes corruption and crash vectors at the boundaries. Schema-validated `AttentionItem` becomes a runtime contract, not a TypeScript-only one.

## Related Files

- `src/main/types.ts:18-29, :44-55` — `FlintConfig`, `AttentionItem` interfaces (need runtime schemas)
- `src/main/config.ts:68-74` — write path needs validation
- `src/main/copilot/tools.ts:256-301` — `set_attention_items` handler
- `src/main/attention/store.ts:13-15` — `getAll` returns by reference
- `src/main/index.ts:166-171` — `chat:send` handler
- `src/main/ipc/handlers.ts` — all IPC handlers
- `package.json` — likely needs `zod` added (or pick `valibot`/`@sinclair/typebox`)

## Dependencies

- `fix-two-writer-attention-store.md` (P0) — adds `owner` field to `AttentionItem`; the schema must reflect the final shape

## Acceptance Criteria

- [ ] Validation library chosen (recommended: `zod`) and added to `package.json`
- [ ] New module `src/main/lib/schemas.ts` exports runtime schemas for `FlintConfig`, `AttentionItem`, and any other cross-boundary types. Schemas are the source of truth; TypeScript types are derived via `z.infer`.
- [ ] `config:set` handler validates the partial against `FlintConfigSchema.partial()`. Invalid fields are rejected (logged + dropped); valid fields proceed.
- [ ] `chat:send` handler validates: `prompt` is string, length ≤ 10_000 chars (or pick a sensible cap). Invalid → log + drop, optionally send error to renderer.
- [ ] `set_attention_items` tool handler validates the LLM-provided array via `z.array(AttentionItemSchema)`. Invalid items are dropped (logged), valid items proceed. If ALL items are invalid, log error and don't update the store.
- [ ] `AttentionStore.getAll()` returns a defensive copy (`return [...items]`) OR deep-frozen array. Document the choice.
- [ ] Unit tests in `src/main/__tests__/schemas.test.ts` covering: valid config, invalid config (each field), valid AttentionItem, invalid AttentionItem (missing required fields, wrong types, malformed openAction)
- [ ] Existing config and attention store tests updated to confirm validation behavior
- [ ] No remaining `as AttentionItem[]` or `as FlintConfig` casts at trust boundaries — replaced by schema parses

## Verification

**Automated (required):** the unit tests above. Integration tests for each boundary asserting invalid input is rejected without crashing.

**Ad-hoc:** in dev mode, send a malformed config from the renderer (e.g., via DevTools console: `window.flint.setConfig({ alertMinutes: "not-a-number", model: 42 })`). Confirm log shows rejection, file on disk unchanged.

## Notes

- Zod adds ~50KB to the bundle. Acceptable for a desktop app.
- Schemas should live in `src/main/lib/schemas.ts` and be imported by both main process and (where shapes are shared) the renderer via type re-exports — avoid bundling Zod into the renderer if possible.
- For `AttentionItem`, the `owner` field added by `fix-two-writer-attention-store.md` is set by the handler, NOT validated from LLM input — schema for the LLM-facing input must NOT include `owner`. Be careful to use the right schema variant at the right boundary.
- This task complements rather than duplicates `lock-down-permissions.md` — that one gates side effects; this one gates data shape.
