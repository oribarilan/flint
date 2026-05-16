# lock-down-permissions

## Context

Both Copilot sessions use `onPermissionRequest: approveAll` (`src/main/copilot/sessions.ts:53` and `:81`). This auto-approves every permission request without user awareness.

Even after `verify-sdk-tool-restriction.md` confirms built-in tools are disabled, `approveAll` remains a problem because **LLM tool input is user-controlled content** (email subjects, meeting titles, Teams DMs once Work IQ is wired). A prompt-injected email could cause `join_meeting` to open `https://attacker.example/phish` with no user confirmation. Same vector for `show_notification` (phishing prompts).

The right model: per-tool policy. Read-only / UI-only tools auto-approve. Side-effect tools require either a domain allowlist (for `join_meeting`) or first-time confirmation.

**Value delivered**: Closes the prompt-injection-to-side-effect vector. Even if a future tool is added carelessly, it lands in "deny by default" rather than "auto-approve."

## Related Files

- `src/main/copilot/sessions.ts` — both `createSession` calls
- `src/main/copilot/tools.ts` — tool definitions; `join_meeting` URL handling at `:230-241`
- `src/main/copilot/permissions.ts` — **new file** to create

## Dependencies

- `verify-sdk-tool-restriction.md` (P0) — finishes the perimeter; this task closes the inner ring

## Acceptance Criteria

- [ ] New module `src/main/copilot/permissions.ts` exports `createPermissionPolicy(config)` returning an `onPermissionRequest` handler
- [ ] Policy auto-approves: `ask_work_iq`, `set_attention_items`, `show_overlay`, `show_notification` (rationale: read-only or UI-only effects with no external side effect)
- [ ] Policy gates `join_meeting`: extract URL host, allow if host matches a configured allowlist (default: `teams.microsoft.com`, `teams.live.com`, `meet.google.com`, `zoom.us`); deny otherwise with an audit log line
- [ ] Policy denies (with logged reason) any tool name not on its known list — fail-closed for unknown tools
- [ ] Both session creations in `sessions.ts` use the new policy instead of `approveAll`
- [ ] Unit tests in `src/main/__tests__/copilot-permissions.test.ts` cover: each auto-approved tool, each gated tool path (allowed host, denied host, malformed URL), unknown tool denial
- [ ] No remaining import of `approveAll` from `@github/copilot-sdk` in `src/main/copilot/sessions.ts`

## Verification

**Automated (required):** unit tests above + an integration test in `copilot-sessions.test.ts` mocking the SDK's permission flow and asserting the handler is called with the right arguments and returns the right decisions for representative tool calls.

Manual: in dev mode, try sending a chat message that would cause the model to call `join_meeting` with a phishing URL (e.g., paste a fake Teams URL pointing at `evil.example`). Confirm log shows denial.

## Notes

- The allowlist could later move to user-configurable settings, but for V1 a hardcoded set is fine — keep it in `permissions.ts` as a `const`.
- `show_notification` is intentionally auto-approved despite being a side effect: the worst case is a misleading notification, which the user sees and dismisses. Adding friction here would be wrong.
- This task does NOT add a UI prompt for first-time domain approval (deferred to V2 if needed). For V1, hardcoded allowlist + denial log is sufficient.
- Coordinate with `centralize-url-validation.md` — the URL parsing helper used here should be the same one used by `link:open` and `attention:open`.
