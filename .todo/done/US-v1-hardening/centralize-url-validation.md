# centralize-url-validation

## Context

URL opening happens at three sites with inconsistent validation:

| Site | File | Validation |
|---|---|---|
| `link:open` IPC | `src/main/ipc/handlers.ts:46-57` | Validates `protocol === 'http:' || 'https:'` |
| `attention:open` IPC | `src/main/ipc/handlers.ts:39-43` | **None — opens whatever URL is in `item.openAction.url`** |
| `join_meeting` tool | `src/main/copilot/tools.ts:237-239` | **None — opens whatever URL the LLM passes** |

The latter two are direct attack vectors:
- `attention:open` opens URLs from AttentionItems written by the LLM (monitor or chat session). A prompt-injected email could land an item with `openAction.url: "javascript:..."` or `"file:///etc/passwd"`.
- `join_meeting` opens whatever URL the LLM passes. Same vector, more direct.

DRY violation in addition to security: three call sites, two validation policies, easy to forget the next time someone adds a fourth.

**Value delivered**: Closes the `file://`, `javascript:`, custom-scheme, and other non-http(s) attack vectors. Single helper that future code naturally reaches for.

## Related Files

- `src/main/ipc/handlers.ts:39-57` — both `attention:open` and `link:open`
- `src/main/copilot/tools.ts:230-241` — `join_meeting`
- `src/main/lib/url.ts` — **new file** to create (or `src/main/utils/url.ts`)
- `src/main/copilot/permissions.ts` — `lock-down-permissions.md` will use the same helper for host extraction

## Dependencies

None. Coordinate with `lock-down-permissions.md` — both touch URL handling; the helper here is the foundation that task builds on.

## Acceptance Criteria

- [ ] New module exports `openExternalUrl(url: string): { ok: boolean; reason?: string }`
- [ ] Helper validates: URL parses, protocol is `http:` or `https:`, no embedded credentials (`user:pass@host`), no whitespace; returns `{ ok: false, reason }` otherwise
- [ ] On valid URL: calls `shell.openExternal(url)`, returns `{ ok: true }`
- [ ] On invalid URL: logs structured warning (e.g., `[url] blocked open: ${reason} url=${redactedUrl}`), returns `{ ok: false, reason }`. Do NOT log full URL if it contains credentials.
- [ ] All three call sites refactored to use `openExternalUrl`. No raw `shell.openExternal` calls remain in `src/main/` outside this helper (verify with grep).
- [ ] `attention:open` IPC handler: if URL is invalid, surface a notification or log only (don't crash, don't silently succeed)
- [ ] `join_meeting` tool: if URL is invalid, return error string to LLM (e.g., `"blocked: non-http URL"`) so the model can react appropriately
- [ ] Unit tests in `src/main/__tests__/url.test.ts` covering: valid http, valid https, http with port, https with path/query, `javascript:`, `file://`, `data:`, malformed, empty string, URL with credentials, URL with whitespace
- [ ] All three call site behaviors covered by their existing tests (or new tests added)

## Verification

**Automated (required):** unit tests for the helper + integration tests for each call site asserting non-http URLs are rejected.

**Ad-hoc:** in dev mode, manually craft an attention item with `openAction.url: "file:///etc/passwd"` (e.g., via a test prompt that triggers `set_attention_items` with such a URL). Click "Open." Confirm the file does not open.

## Notes

- The host-extraction logic for `join_meeting`'s domain allowlist (in `lock-down-permissions.md`) should also live in this URL module — `parseHost(url): string | null`.
- Consider whether to also block IDN homograph attacks (e.g., Cyrillic look-alikes). Likely overkill for V1, but document the gap.
- `mailto:` and `tel:` are NOT allowed by this V1 helper. If future needs require them, add explicitly.
