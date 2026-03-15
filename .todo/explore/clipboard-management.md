# Clipboard Management Kit

## Summary

A Flint kit that tracks clipboard history and lets users search, copy, pin, and delete past entries from the launcher. Text-only in Phase 1. Entries are persisted in a file-based store (loaded into memory on init) and the history is searched via the standard chip-based `InputResults` flow — no dedicated app window.

## Dependencies

- **Kit system infrastructure** — the `KitRegistry`, `KitContext`, command registration, chip UX, and background task lifecycle must be implemented first.
- **Action Panel** (`specs/action-panel.md`) — clipboard results surface Delete and Pin/Unpin actions via the Action Panel. The panel (including armed state confirmation for Delete) must exist before this kit ships.

## UX Decisions

These were explicitly decided during planning and should be treated as requirements.

| Decision | Choice |
|----------|--------|
| **Default action (Enter)** | Copy to system clipboard (user pastes manually with Cmd+V) |
| **Empty-query view** | Pinned entries first, then most recent |
| **Content types (Phase 1)** | Text only — images deferred |
| **Persistence** | File-based store (JSON/bincode), loaded into memory on init — history survives restarts |
| **Duplicate handling** | Deduplicate — re-copying same text moves it to the top, updates timestamp, preserves pin status |
| **Clear history confirmation** | Yes — armed state confirmation (same as Delete actions) |
| **App window** | None — chip + result list is the entire clipboard UX |
| **Result layout** | First line only (truncated with `…`), metadata in subtitle |
| **Max entry size** | 100KB per entry; larger text is silently dropped |
| **Dedup as self-copy handler** | When Flint writes to clipboard, the watcher detects the change and dedup handles it — no special self-copy detection needed |
| **Actions per result** | Copy (default action, Enter), Delete, Pin/Unpin — all surfaced via Action Panel |
| **Pinned entry retention** | Pinned entries are exempt from retention period and max_history cap |
| **Default state** | Kit is **disabled by default** — user enables in Settings |
| **Default prefix** | None — user configures a prefix in Settings if desired |
| **Default hotkey** | None (per kit design principle) |

## Privacy & Security

Clipboard data is inherently sensitive. The kit implements four layers of protection:

### 1. Excluded Apps List
User-configurable list of apps whose clipboard writes are never captured. Obvious defaults: password managers (1Password, Bitwarden, KeePassXC, LastPass).

**Config:** `excluded_apps: Vec<String>` — matched against the source app name reported by the OS clipboard.

### 2. Concealed / Transient Content Detection (Deferred)

> **Deferred to future enhancement.** See `.todo/explore/concealed-clipboard-markers.md` for details.
>
> Some apps mark clipboard content as "concealed" or "transient" (e.g., password managers on macOS set `org.nspasteboard.ConcealedType`). Detecting these requires direct platform API access beyond what `arboard` provides. For Phase 1, the excluded apps list and secret heuristics provide sufficient protection.

### 3. Secret-Like Content Detection
Heuristic detection of content that looks like passwords, API keys, or tokens. These entries are either auto-deleted after a short TTL or never stored at all.

**Heuristics (non-exhaustive):**
- High entropy short strings (< 100 chars, entropy > 4.0 bits/char)
- Strings matching common token patterns: `ghp_*`, `sk-*`, `Bearer *`, `eyJ*` (JWT), `AKIA*` (AWS), hex strings 32+ chars
- Strings that look like passwords: mixed case + digits + symbols, no spaces, 8–64 chars

**Behavior:** Detected entries are stored as **redacted placeholders** — visible in history with source app and timestamp, but content is not stored and cannot be copied. This gives users visibility into what was filtered and a path to adjust settings if needed. Redacted entries do not count toward `max_history`. The default action (Enter) is a no-op on redacted entries.

**False positive mitigation:** The following patterns are explicitly excluded from detection:
- UUIDs / GUIDs (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- Hex color codes (e.g., `#FF5733`, `#FF5733AA`)
- Base64 with recognizable structure (e.g., data URIs, common encoding prefixes)

**Config:** `sensitive_detection: bool` (default: `true`). User can disable if it causes false positives.

### 4. Retention Period
Entries older than `retention_days` are automatically deleted. Pinned entries are exempt.

**Config:** `retention_days: u32` (default: `7`).

Cleanup runs on app startup and periodically (e.g., every hour) while the app is running. `max_history` cap is enforced immediately on every insert (delete oldest non-pinned if over cap).

## Architecture

### Kit Registration

The clipboard kit registers with the `KitRegistry` as a standard kit:

**Commands:**
| Command | Mode | Description |
|---------|------|-------------|
| `history` | `InputResults` | Search clipboard history via chip |
| `clear` | `Execute` | Clear all non-pinned history (with confirmation) |

**No default prefix.** No default hotkey. Kit disabled by default.

### Data Model

```
ClipboardEntry
├── id: u64 (auto-increment)
├── content_hash: u64 (Rust DefaultHasher, for dedup)
├── preview: String (first line, truncated with … if needed)
├── full_content: String (complete text, up to 100KB)
├── source_app: Option<String>
├── timestamp: DateTime<Utc>
├── pinned: bool
└── redacted: bool (true for sensitive-filtered entries — no content stored)
```

**In-memory store:** All entries are loaded into memory on kit init from a file-based store (`<kit data dir>/clipboard.json`). All operations (search, insert, delete, pin) happen in-memory. The file is written on every mutation (insert, delete, pin toggle, retention cleanup). With ≤200 entries this is trivially fast.

### File-Based Storage

Entries are serialized as JSON to `<kit data dir>/clipboard.json` (via `KitContext::data_dir`). The file contains the full list of `ClipboardEntry` structs. On init, the file is loaded into a `Vec<ClipboardEntry>` in memory. On mutation, the entire list is re-serialized to disk.

**Why not SQLite:** The project doesn't use SQLite anywhere. For ≤200 entries with simple operations (insert, delete, search by hash, filter by age), file-based storage is simpler, has zero new dependencies, and is consistent with existing patterns.

### Clipboard Watcher

A background task (registered via the kit's background task infrastructure) that monitors the system clipboard:

1. **Platform-specific change detection:**
   - macOS: `NSPasteboard.changeCount` — compare change count each tick, avoid reading content unless changed.
   - Windows: `AddClipboardFormatListener` — event-driven, no polling needed.
   - Linux: Content equality check — keep last clipboard string in memory, compare with current. String comparison short-circuits on first differing byte, so this is fast for the common "nothing changed" case.

2. **Polling interval:** 500ms (for platforms that need polling). Configurable.

3. **On change detected:**
   - Read text content from clipboard.
   - Check source app against excluded apps list → skip if matched.
   - Check content size → skip if > 100KB.
   - Run secret-like content heuristics → if detected as sensitive, store as redacted placeholder (no content, marked `redacted: true`).
   - Compute hash of content (Rust `DefaultHasher`).
   - Check hash against existing entries → if duplicate, update timestamp and move to top.
   - If new: insert into in-memory store, enforce `max_history` cap immediately (delete oldest non-pinned), persist to file.

4. **Self-copy handling:** No special detection needed. When Flint writes to the clipboard (user copies an entry), the watcher detects the change and the dedup logic handles it — the existing entry's timestamp is updated and it moves to the top. This is correct behavior since the user just used that entry.

### Search

When the `history` command is active (chip shown), every keystroke routes to the kit's search handler.

- **Empty query:** Return pinned entries first (sorted by timestamp DESC), then unpinned entries (sorted by timestamp DESC). Limit to result list size.
- **Non-empty query:** Fuzzy match against `preview` text using nucleo. Pinned matches sort above unpinned matches at equal relevance scores.
- **Performance:** Search runs against in-memory entries. Must return within 10ms per the kit performance contract.

### Actions

Clipboard results provide an ordered action list, surfaced via the Action Panel (`specs/action-panel.md`):

| # | Action | `KitAction` Type | Confirm | Notes |
|---|--------|-------------------|---------|-------|
| 1 | **Copy** | `Copy { text, label }` | No | Default action (Enter). Reads `full_content` from in-memory store, writes to system clipboard, hides Flint. No-op on redacted entries. |
| 2 | Pin / Unpin | `Custom { id: "toggle_pin" }` | No | Toggles `pinned` flag. Pinned entries are exempt from retention/cap. Label is contextual: "Pin" or "Unpin". |
| 3 | Delete | `Delete { target }` | **Yes** (armed state) | Removes entry from in-memory store and persists to file. Two-press armed state confirmation per Action Panel spec. |

`Copy` uses the existing `KitAction::Copy` variant. `Pin/Unpin` uses `Custom` since there is no built-in pin variant — the kit handles execution via `custom_action_handler`. `Delete` uses `KitAction::Delete` which triggers armed state confirmation automatically.

### Clear Command

The `clear` Execute command deletes all non-pinned entries. Since it's destructive:

1. User selects "Clear Clipboard History" from command discovery.
2. Armed state confirmation (same pattern as Delete actions): row turns red with "Press Enter again to clear all non-pinned entries." Auto-disarms after 3 seconds.
3. On confirm: delete all entries where `pinned = false`, persist to file.
4. Pinned entries are preserved.

## Configuration

```toml
[kits.clipboard]
enabled = false              # disabled by default
max_history = 200            # max non-pinned entries
retention_days = 7           # auto-delete entries older than this
sensitive_detection = true   # heuristic secret/token detection
excluded_apps = []           # apps whose clipboard writes are ignored
poll_interval_ms = 500       # clipboard polling interval

[kits.clipboard.commands.history]
enabled = true
prefix = ""                  # no default prefix — user configures

[kits.clipboard.commands.clear]
enabled = true
```

Settings UI: part of the Kits settings page per the kit system spec. The clipboard kit card expands to show its commands and kit-specific settings (max_history, retention_days, excluded_apps, sensitive_detection toggle).

## Implementation Plan

### Phase 1: Core clipboard kit (text-only)

#### 1.1 — File-based storage module
- Create `clipboard.json` schema (entries list).
- CRUD operations: insert, get by id, search by hash, delete, update timestamp, toggle pin.
- Retention cleanup: delete non-pinned entries older than `retention_days`.
- Max history enforcement on insert: delete oldest non-pinned entries when count exceeds `max_history`.
- File persistence: load on init, write on every mutation.
- Unit tests: CRUD, dedup, retention, cap enforcement on insert, pinned exemption, file round-trip.

#### 1.2 — Search
- Fuzzy search via nucleo over preview text (in-memory).
- Pinned-first sorting for empty queries, relevance-based for non-empty.
- Unit tests: search accuracy, pinned sorting, empty query ordering.

#### 1.3 — Privacy filters
- Excluded apps matching (case-insensitive string match on source app name).
- Secret-like content heuristics (entropy calculation, pattern matching).
- False positive exclusions: UUIDs, hex color codes, recognizable base64 structures.
- Redacted placeholder entry creation for filtered content.
- Unit tests: each filter type with positive and negative cases, false positive exclusions.

#### 1.4 — Clipboard watcher
- Platform-specific change detection (macOS `changeCount`, Windows listener, Linux content equality check).
- Content ingestion pipeline: detect change → read → filter → hash → dedup → store → persist.
- Background task registration via kit infrastructure.
- Unit tests: change detection, pipeline filtering, dedup logic.

#### 1.5 — Kit registration & commands
- Register `clipboard` kit with `KitRegistry`.
- `history` command (InputResults): chip activation, search routing, result rendering.
- `clear` command (Execute): armed state confirmation, bulk delete.
- IPC commands wired through `search_command` / `execute_command`.
- Config loading and defaults.

#### 1.6 — Frontend integration
- Clipboard results rendered via default result component (no custom component needed).
- Result layout: first line of content as title (truncated with `…`), metadata as subtitle/accessories (source app, time ago).
- Redacted entries: distinct visual treatment (lock icon, "Sensitive content filtered" label), copy action disabled.
- Actions: Copy (default), Pin/Unpin, Delete — surfaced via the Action Panel. Delete uses armed state confirmation.
- Armed state confirmation for the `clear` Execute command (same pattern as Delete).

#### 1.7 — Tests
- Rust unit tests for each module (storage, index, privacy, watcher, commands).
- Frontend tests: result rendering, action dispatch, chip flow.
- Integration test: full pipeline from clipboard change → storage → search → copy back.

### Phase 2: Future enhancements (deferred)

- **Image clipboard support** — store images as file references, show thumbnails in results.
- **Rich text support** — preserve formatting metadata.
- **Snippet saving** — promote clipboard entries to persistent named snippets.
- **Cross-device sync** — far future, if ever.

## Platform Considerations

| Concern | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Change detection | `NSPasteboard.changeCount` | `AddClipboardFormatListener` | Content equality check (string comparison) |
| Source app | `NSWorkspace.frontmostApplication` (best-effort) | `GetForegroundWindow` + process name (best-effort) | X11: `_NET_ACTIVE_WINDOW`, Wayland: compositor-dependent (best-effort) |
| Concealed content | Deferred (see `.todo/explore/concealed-clipboard-markers.md`) | Deferred | No standard mechanism |
| Clipboard access | `arboard` | `arboard` | `arboard` |

Use `#[cfg]` attributes with platform-specific modules and a shared trait interface per the cross-platform conventions.

## Out of Scope

- Clipboard sync between devices
- Clipboard sharing / collaboration
- OCR on clipboard images
- Clipboard rules/transformations (e.g., auto-trim whitespace)
- Image support (Phase 2)
- Rich text support (Phase 2)
- App window / dedicated history browser (chip + results list is sufficient)
