# decompose-tools-module

## Context

`src/main/copilot/tools.ts` is 322 LOC mixing four distinct concerns:

1. **Tool definitions** (the `defineTool` calls, ~70 LOC)
2. **Mock fixture data** for `ask_work_iq` (~250 LOC, lines 36–209)
3. **Side-effect handlers** (notification, shell.openExternal)
4. **Session-specific tool subset selection** (`getChatTools`, `getMonitorTools`)

After `wire-real-work-iq.md` completes, the mock fixtures should already be deleted or moved to `__tests__/fixtures/`. But the remaining concerns still warrant separation:

- Tool definitions (the schemas + handler signatures) are the API surface
- Side-effect handlers are infrastructure (notification + URL open)
- Subset selection is configuration

Mixing them all in one file makes it hard to:
- Test handlers in isolation (each handler has its own concerns)
- Review tool schemas without scrolling past handler bodies
- Add a new tool without inflating the megafile

After `lock-down-permissions.md` adds a `permissions.ts` module and `centralize-url-validation.md` adds a `lib/url.ts`, the side-effect handlers will already be 1-line wrappers. This task finishes the cleanup.

**Value delivered**: Each tool lives in its own file. Adding a new tool is "create one file." `tools.ts` becomes a manifest, not an implementation.

## Related Files

- `src/main/copilot/tools.ts` — to decompose
- `src/main/__tests__/copilot-tools.test.ts` — to split alongside
- `src/main/copilot/sessions.ts` — consumer of `getChatTools` / `getMonitorTools`

## Dependencies

- `wire-real-work-iq.md` (US-v1-hardening) — must land first to remove the 250 LOC of fixtures
- `lock-down-permissions.md` (US-v1-hardening) — sets up `permissions.ts`, used by tool handlers
- `centralize-url-validation.md` (US-v1-hardening) — sets up `lib/url.ts`, used by `join_meeting`

## Acceptance Criteria

- [ ] New directory `src/main/copilot/tools/`
- [ ] One file per tool, each <80 LOC:
  - `tools/show-notification.ts`
  - `tools/join-meeting.ts`
  - `tools/show-overlay.ts`
  - `tools/set-attention-items.ts`
  - (Note: `ask-work-iq.ts` is gone — handled by Work IQ MCP after `wire-real-work-iq.md`)
- [ ] Each tool file exports a single factory: `createXTool(deps): Tool`
- [ ] `tools/index.ts` exports `getChatTools(deps)` and `getMonitorTools(deps)` as the only public API. Composition lives here.
- [ ] Old `src/main/copilot/tools.ts` deleted
- [ ] Each tool file has its own focused test in `src/main/__tests__/tools/`
- [ ] Old `copilot-tools.test.ts` reorganized accordingly
- [ ] No file in the new structure exceeds 100 LOC
- [ ] Imports in `sessions.ts` updated; no other call sites broken
- [ ] All existing tool behaviors preserved; full test suite passes

## Verification

**Automated (required):** `just check` passes after refactor.

**Ad-hoc:** in dev mode, exercise each tool path:
- Send chat message that triggers `set_attention_items` → panel updates
- Click "Open" on a card → URL opens (via `centralize-url-validation`)
- Trigger `show_notification` (via test notification button) → notification appears

## Notes

- This is pure restructuring. Behavior must be identical.
- The `defineTool` calls already provide good encapsulation; this task is mostly about file boundaries, not API redesign.
- Consider whether to colocate each tool's tests next to its file (`tools/show-notification.test.ts`) vs centralized `__tests__/tools/`. The project convention so far is centralized; keep it unless there's a strong reason to change.
- After this lands, adding a future tool (e.g., `archive_email`, `decline_meeting`) is genuinely "create one file." That's the win.
