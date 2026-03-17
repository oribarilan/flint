# Search v3: Spotlight-Backed Search

## Summary

Replace Flint's custom filesystem walker, cache, watcher, and exclusion engine with macOS Spotlight queries. Flint should not build or maintain its own file index — it should query the OS-level index that macOS already maintains. This eliminates ~1200 LOC (deleted files) plus significant simplification of mod.rs/search.rs/commands.rs/lib.rs, 6 Rust dependencies, ~96MB of runtime memory, and a 21-second startup walk.

macOS only. Windows/Linux search is deferred — those platforms will need a different backend (Windows Search, `plocate`, or a custom walker with the `ignore` crate).

## Current State

- Custom `walkdir`-based parallel walker over `~/` + platform roots
- In-memory `IndexMap<String, FileEntry>` with ~350K–1M entries (~96–280MB)
- `bincode` cache at `~/.cache/flint/index.bin` for cold-start speed
- `notify-debouncer-full` filesystem watcher for live updates
- Built-in exclusion list (50+ directory names) + macOS-specific exclusions
- 21-second full walk on a typical dev machine
- `nucleo` fuzzy scoring against the full in-memory index per keystroke

## Design

### Architecture: preloaded apps + per-keystroke Spotlight

**Startup (0.1s):**
```
mdfind 'kMDItemContentType == "com.apple.application-bundle"'
→ ~400 app paths → parse into Vec<FileEntry> → ready for nucleo
```

**Per-keystroke search (debounced ~150ms):**
```
User types "slack"
  ├─ Score preloaded apps with nucleo (fuzzy, <1ms)
  ├─ Spawn mdfind -name "slack" -onlyin ~ (substring, ~100ms)
  │   └─ Kill any in-flight mdfind from previous keystroke first
  ├─ Parse file results into SearchResult entries
  ├─ Merge: apps first (nucleo-scored), then files (mdfind order), then kits
  └─ Return top 20
```

Apps appear instantly (preloaded + nucleo). Files appear ~100–200ms later. This matches Alfred/Raycast behavior — apps first, files follow.

**Query length policy (enforced in Rust backend):**
- < 2 chars: no search (frontend gate, unchanged)
- 2 chars: app results only (nucleo against preloaded apps)
- 3+ chars: apps + files (nucleo + mdfind)

### Why not Spotlight for everything?

Benchmarked `mdfind` on a real machine:

| Query | Results | Time |
|-------|---------|------|
| All apps | 417 | 0.1s |
| `-name "slack"` | 65 | 0.1s |
| `-name "sl"` (2 chars) | 2,015 | 0.66s |
| All files in `~` (bulk) | — | >60s timeout |

Spotlight is optimized for targeted queries, not bulk enumeration. Per-keystroke with debouncing works well for 3+ char queries. For 1–2 char queries, show only app results (preloaded).

### What gets deleted

| File | LOC | Purpose | Replacement |
|------|-----|---------|-------------|
| `indexer/walker.rs` | 533 | Filesystem walking, `classify_path`, platform roots | `mdfind` (`classify_path` moves to `mod.rs`) |
| `indexer/exclusions.rs` | 246 | Exclusion rules (69 built-in + user-defined) | Spotlight handles it |
| `indexer/cache.rs` | 246 | Bincode persistence | Spotlight IS the cache |
| `indexer/watcher.rs` | 184 | notify fs watcher | Spotlight watches |
| **Total** | **1,209** | | |

Commands removed: `rebuild_index`, `index_stats`.
Frontend removed: re-index button, exclude patterns list, index stats display.

### Dependencies removed (macOS)

| Crate | Purpose |
|-------|---------|
| `walkdir` | Directory traversal |
| `rayon` | Parallel walking |
| `notify` | Filesystem events |
| `notify-debouncer-full` | Event debouncing |
| `bincode` | Cache serialization |
| `indexmap` | Ordered hash map |

### What stays

- `indexer/mod.rs` — `FileEntry`, `EntryKind` types, `entry_from_path`, `classify_path` (moved from `walker.rs`)
- New `indexer/spotlight.rs` — `mdfind` wrapper (~100–150 LOC)
- `search.rs` — nucleo scoring (apps only, ~80 LOC)
- `commands.rs` — `search_all` (simplified), `search_files` (mdfind wrapper)
- Kit system — unchanged
- Frontend `useSearch` hook — debounce increased to 150ms, otherwise unchanged

### Config changes

`SearchConfig` simplifies:
```toml
[search]
# Optional: scope file search to specific dirs. Default: home directory.
# directories = ["~/Projects", "~/Documents"]
```

Removed: `exclude`, `max_depth` — Spotlight handles these concerns.

## Steps

### 1. Create `indexer/spotlight.rs`
- `discover_apps() -> Vec<FileEntry>` — runs `mdfind 'kMDItemContentType == "com.apple.application-bundle"'`, parses paths, classifies entries via `entry_from_path`.
- `search_files(query: &str, directories: &[String]) -> Result<Vec<FileEntry>, SpotlightError>` — runs `mdfind -name <query>` (scoped with `-onlyin` per directory), parses results. Returns `SpotlightError::Unavailable` if mdfind fails (exit code != 0 or not found).
- **Process cancellation**: Track the in-flight `tokio::process::Child`. Before spawning a new mdfind, kill the previous one via `Child::kill()`. Use a `Mutex<Option<AbortHandle>>` or similar to ensure at most one mdfind is running.
- Both functions: spawn `mdfind` as `tokio::process::Command`, parse stdout line-by-line, create `FileEntry` from each path via `entry_from_path`.

### 2. Simplify `indexer/mod.rs`
- Remove `build_index_with_config` and `FileIndex` (big IndexMap).
- Move `classify_path` (and its tests) from `walker.rs` into `mod.rs` alongside `entry_from_path` which already calls it.
- New managed state: `AppIndex(Vec<FileEntry>)` — tiny (~400 entries).
- Keep `FileEntry`, `EntryKind`, `entry_from_path`.

### 3. Update `search.rs`
- `scored_search` now takes `&[FileEntry]` (apps only, ~400 entries).
- Remove `IndexMap` dependency.

### 4. Update `commands.rs`
- `search_all`: score apps with nucleo + query Spotlight for files (only if query >= 3 chars) + merge with kits. Ordering: apps first (nucleo-scored), then files (mdfind order), then kits. If Spotlight returns an `Unavailable` error, include a hint result (e.g., "Spotlight indexing unavailable") so the user sees feedback.
- `search_files`: delegate to `spotlight::search_files`.
- Remove `rebuild_index`, `index_stats`, `FileIndex`, `IndexWatcherState`.

### 5. Update `lib.rs` startup
- Replace cache→walk→watcher pipeline with single `spotlight::discover_apps()` call.
- Manage `AppIndex` state instead of `FileIndex` and `IndexWatcherState`.
- No watcher, no cache, no background walk.
- Remove `FileIndex` and `IndexWatcherState` managed state registrations.

### 6. Simplify config
- Remove `exclude` and `max_depth` from `SearchConfig`.
- Keep `directories` as optional scoping for file search.

### 7. Delete dead modules
- `indexer/walker.rs`, `indexer/exclusions.rs`, `indexer/cache.rs`, `indexer/watcher.rs`.

### 8. Clean up dependencies
- Remove `walkdir`, `rayon`, `notify`, `notify-debouncer-full`, `bincode`, `indexmap` from `Cargo.toml`.

### 9. Update frontend
- Remove re-index button, exclude patterns list, and index stats from `SearchSettings.tsx`.
- Remove `rebuildIndex`, `getIndexStats`, `IndexStats` type from `commands.ts`.
- Remove `exclude` and `max_depth` from `SearchConfig` type in `commands.ts`.
- Increase debounce in `useSearch.ts` from 50ms to 150ms.
- Remove `index:completed` event listener from `SearchSettings.tsx`.

### 10. Update integration tests
- `tests/search_pipeline.rs` — adapt to new API.
- Add Spotlight-specific tests (mock `mdfind` output parsing).

### 11. Update docs
- `README.md` — already updated (macOS-only, Spotlight-backed).
- `gaps.md` — already updated.
- `spec.md` — update Search Settings section (no exclude/depth config).
- Move `search-v2.md` to `done/`.

## Risks

| Risk | Mitigation |
|------|------------|
| `mdfind` latency for short queries (1–2 chars) | Only show app results for queries < 3 chars. Files require 3+ chars. Gate enforced in Rust `search_all`. |
| Spotlight not indexing some directories | User can adjust Spotlight privacy settings. Document in README. |
| `mdfind` subprocess overhead per keystroke | Debounce at 150ms. Kill in-flight mdfind before spawning new one. Cache most recent query result. |
| Orphaned `mdfind` processes | Track `Child` handle; `kill()` previous before spawning next. At most one mdfind in flight. |
| No fuzzy matching for files (`mdfind -name` is substring) | Fuzzy matching on apps (preloaded). Substring is fine for files — users type partial filenames. |
| Spotlight disabled or unavailable | Return empty file results + include a user-visible hint result ("Spotlight indexing unavailable"). App results still work. Log warning. |
| macOS-only | Clearly documented. Windows/Linux deferred. |

## Out of Scope

- Windows/Linux search backends
- Full fuzzy matching on files (would require bulk-loading, which Spotlight can't do efficiently)
- Spotlight content search (searching inside files)
- `NSMetadataQuery` native API (subprocess `mdfind` is sufficient for now)
