# Search v2: Broad Scope, Live Index, Persistence

## Summary

Overhaul Flint's search from a narrow directory-list approach to a real full-home-directory indexer with filesystem watching and a persisted cache. After this work, Flint searches the same scope a user would expect from Spotlight or Alfred — and stays current without restarts.

Three pillars:
1. **Broad default scope** — Index `~/` with smart exclusions instead of a handful of hand-picked directories.
2. **Filesystem watching** — Use the `notify` crate to keep the index live. New/renamed/deleted files appear in results within seconds.
3. **Persisted index** — Serialize to disk so cold starts don't require a full re-walk. Startup loads cache → shows results instantly → background delta reconciles.

## Current State

- Index built once at startup via `build_index_with_config()` — parallel `walkdir` + `rayon`.
- Scope: `~/Desktop`, `~/Documents`, `~/Downloads`, `/Applications`, `/System/Applications` (macOS).
- In-memory only: `Arc<RwLock<Vec<FileEntry>>>`, ~280 bytes/entry.
- No file watching (`notify` is a dependency but unused).
- No persistence — full re-walk on every launch.
- Exclusions: hidden dirs, `node_modules`, `.git`, `target`, `__pycache__`, `.Trash`, `venv`, `env`, `bower_components`.
- macOS `.app` bundles indexed as leaf nodes (no recursion into Contents/).
- Search: `nucleo` fuzzy match, O(n) per query, <10ms for 100k entries.

## Requirements

### Broad scope
- Default to `~/` as the root, plus platform roots (`/Applications`, `/System/Applications` on macOS).
- Significantly expand exclusion list to keep index lean (see Exclusions section below).
- `max_depth` default increases from 6 → 10 (configurable).
- Config `search.directories` still works as an override — if set, use those instead of `~/`.
- Index size target: <200k entries for a typical dev machine. Monitor and warn if exceeded.

### Filesystem watching
- Watch all indexed roots with `notify` (debounced, ~500ms).
- Events: create → add to index, delete → remove from index, rename → update path + name.
- Modifications to file content are ignored (we index names, not contents).
- Watcher respects the same exclusion rules as the initial walk — don't watch inside `node_modules`, etc.
- Watcher lifecycle: start after initial index completes, stop on app shutdown.
- Handle watcher errors gracefully (log + continue, don't crash).

### Persisted index
- Serialize index to `~/.cache/flint/index.bin` (or platform-appropriate cache dir).
- Format: bincode or MessagePack — compact, fast to deserialize. Not human-readable (it's a cache).
- Include metadata: version stamp, timestamp, list of indexed roots, exclusion config hash.
- Startup flow:
  1. Load cache if present and config hasn't changed → populate index immediately.
  2. Spawn background full walk to reconcile (delta against cache).
  3. When walk completes, merge changes and write new cache.
- If cache is missing or stale (config changed), fall back to full walk (current behavior).
- Cache invalidation: config hash mismatch, or cache older than 7 days.

### Re-index command
- `rebuild_index` Tauri command: drops current index, does a full re-walk, writes new cache.
- Exposed via tray menu ("Re-index files") and Settings UI button.
- During re-index, search still works against stale data — don't block.
- Emit progress events to frontend (started, percentage, completed, entry count).

## Exclusions (Expanded)

The full `~/` scope requires a more aggressive exclusion list. These are **defaults** — all overridable via `search.exclude` in config.

### Universal exclusions (all platforms)
```
node_modules, .git, target, __pycache__, .Trash, venv, env,
bower_components, .cache, .npm, .yarn, .pnpm-store, .cargo,
.rustup, .gradle, .m2, .ivy2, .sbt, .coursier,
.docker, .vagrant, .terraform,
dist, build, out, .next, .nuxt, .svelte-kit,
.tox, .mypy_cache, .pytest_cache, .ruff_cache,
coverage, .nyc_output, .turbo,
.local/share/Trash, Library/Caches, Library/Logs,
Library/Application Support/CrashReporter,
.Spotlight-V100, .fseventsd, .DS_Store
```

### macOS package extensions (index as leaf, don't recurse)
Already handled: `.app`, `.framework`, `.bundle`, `.plugin`, `.prefPane`, `.kext`, `.photoslibrary`, `.musiclibrary`, `.xcodeproj`, `.xcworkspace`, `.playground`.

Add: `.fcpbundle`, `.emlx`, `.vmwarevm`, `.sparsebundle`, `.backupbundle`.

### Config structure
```toml
[search]
# Omit `directories` to use the default (~/  + platform roots).
# Set explicitly to restrict scope.
# directories = ["~/projects", "~/Documents"]
exclude = ["node_modules", ".git", "..."]   # merged with built-in list
max_depth = 10
```

Decision: `search.exclude` in config **extends** the built-in list (additive), not replaces. Add a separate `search.exclude_override` if a user truly wants to replace. This prevents users from accidentally removing critical exclusions like `.git`.

## Architecture

### Index storage — replace `Vec<FileEntry>` with `HashMap`

Current: `Arc<RwLock<Vec<FileEntry>>>` — O(n) for lookups and deletions.

For filesystem watching, we need efficient insert/delete by path. Switch to:

```rust
pub struct FileIndex {
    entries: Arc<RwLock<IndexMap<PathBuf, FileEntry>>>,
}
```

Using `IndexMap` (from the `indexmap` crate) gives us:
- O(1) insert/delete/lookup by path (needed for fs events).
- Ordered iteration (preserves insertion order, needed for consistent search results).
- `nucleo` scoring still iterates all entries — O(n) is fine since n ≤ 200k.

### Watcher architecture

```
┌──────────────────────────────────────────────────────────┐
│  notify::RecommendedWatcher                              │
│  Watches indexed roots, filters by exclusion rules       │
│  Debounces events (~500ms via notify's built-in)         │
├──────────────────────────────────────────────────────────┤
│  tokio::mpsc channel                                     │
│  Watcher thread → async event processor                  │
├──────────────────────────────────────────────────────────┤
│  Event processor (tokio task)                            │
│  - Create: classify + insert into IndexMap              │
│  - Delete: remove from IndexMap                          │
│  - Rename: remove old path + insert new                  │
│  - Batches rapid events before acquiring write lock      │
└──────────────────────────────────────────────────────────┘
```

Key decisions:
- Use `notify::RecommendedWatcher` with `notify-debouncer-full` for cross-platform compat.
- Watcher runs in its own OS thread (required by `notify`), sends events over a `tokio::mpsc` channel.
- Event processor is a `tokio` task that acquires write lock on the index, applies batch, releases.
- Debounce at 500ms — aggressive enough to catch rapid saves, lazy enough to not thrash.
- Re-apply exclusion rules on every event (a newly created `node_modules/` should be ignored).

### Cache format

```rust
#[derive(Serialize, Deserialize)]
struct IndexCache {
    version: u32,                           // Schema version for forward compat
    created_at: u64,                        // Unix timestamp
    config_hash: u64,                       // Hash of (directories + exclude + max_depth)
    entries: Vec<(String, FileEntry)>,      // Path → entry pairs
}
```

Serialize with `bincode` — minimal overhead, widely used in Rust. Estimated sizes:
- 100k entries → ~15 MB on disk
- 200k entries → ~30 MB on disk
- Load time: <200ms (bincode is zero-copy-friendly)

### Startup flow (updated)

```
App launch
  ├─ Load config
  ├─ Check for index cache (~/.cache/flint/index.bin)
  │   ├─ Cache exists + config hash matches + age < 7 days
  │   │   ├─ Deserialize cache → populate index (instant results)
  │   │   └─ Spawn background reconciliation walk
  │   │       ├─ Walk filesystem
  │   │       ├─ Diff against cached entries (adds, removes, renames)
  │   │       ├─ Apply delta to live index
  │   │       └─ Write updated cache
  │   └─ Cache missing or stale
  │       ├─ Spawn background full walk (current behavior)
  │       └─ Write cache when complete
  ├─ Start filesystem watcher (after initial index populated)
  └─ Ready for search queries
```

### File structure (new/modified)

```
src-tauri/src/
  indexer.rs          — Refactor: IndexMap storage, broader scope, expanded exclusions
  indexer/
    walker.rs         — Extract: directory walking logic (from indexer.rs)
    watcher.rs        — New: filesystem watcher (notify integration)
    cache.rs          — New: index serialization/deserialization
    exclusions.rs     — New: exclusion rules (built-in + config merge logic)
  search.rs           — Minor: adapt to IndexMap iteration
  config.rs           — Minor: exclude merge semantics, new defaults
  commands.rs         — New command: rebuild_index, index_stats
  lib.rs              — Updated startup flow
```

## Steps

### 1. Expand exclusions & broaden default scope
- Create `indexer/exclusions.rs` — centralize all exclusion logic.
- Move hardcoded `EXCLUDED_DIRS` and `MACOS_PACKAGE_EXTENSIONS` there.
- Add the expanded exclusion list (see Exclusions section).
- Implement additive merge: built-in defaults + user `search.exclude`.
- Update `SearchConfig::default()` — change default directories to `["~/"]` + platform roots.
- Increase `max_depth` default from 6 → 10.
- Unit tests: exclusion merging, path matching, edge cases.

### 2. Refactor index storage to `IndexMap`
- Replace `Arc<RwLock<Vec<FileEntry>>>` with `Arc<RwLock<IndexMap<PathBuf, FileEntry>>>`.
- Add `indexmap` dependency to `Cargo.toml`.
- Update `FileIndex` managed state type.
- Update `build_index_with_config()` to return `IndexMap`.
- Update `scored_search()` to iterate `IndexMap::values()`.
- Update `search_all` and `search_files` commands.
- Verify all existing tests pass.

### 3. Extract walker module
- Move `walk_directory_configured`, `is_excluded_from`, `is_package_dir`, `classify`, `to_file_entry` to `indexer/walker.rs`.
- Keep `indexer.rs` as the public API (re-exports + `build_index_with_config`).
- No behavior change — purely structural.

### 4. Implement index persistence
- Create `indexer/cache.rs`.
- Define `IndexCache` struct with version, timestamp, config hash.
- Implement `save(path, index, config)` and `load(path, config) -> Option<IndexMap>`.
- Use `bincode` for serialization. Add dependency.
- Cache location: `dirs::cache_dir() / "flint" / "index.bin"`.
- Config hash: hash `(directories, exclude, max_depth)` to detect config changes.
- Update startup in `lib.rs`: try cache load → background walk → write cache.
- Unit tests: round-trip serialization, stale cache detection, config hash mismatch.

### 5. Implement filesystem watcher
- Create `indexer/watcher.rs`.
- Initialize `notify::RecommendedWatcher` with debounced events (~500ms).
- Send events through `tokio::mpsc::unbounded_channel` to async processor.
- Event processor: batch events, acquire write lock, apply creates/deletes/renames.
- Apply exclusion rules on incoming events (don't index `node_modules/package.json` created after initial walk).
- Start watcher after initial index is populated. Stop on `AppHandle` drop.
- Store watcher handle in Tauri managed state so it lives for the app's lifetime.
- Integration tests: create/delete/rename file → verify index updated.

### 6. Re-index command + progress events
- Add `rebuild_index` Tauri command in `commands.rs`.
- Clears current index, runs full walk, writes cache.
- Emits IPC events: `index:started`, `index:progress { percent, count }`, `index:completed { count, duration_ms }`.
- Frontend: listen for events, show status in Settings (and optionally a subtle indicator in search bar).
- Add tray menu item "Re-index files" that invokes the command.
- Add `index_stats` command: returns `{ entry_count, last_indexed, cache_size_bytes }`.

### 7. Update Settings UI
- Search settings section: show index stats (entry count, last indexed time, cache size).
- "Re-index now" button with loading state.
- Display list of currently indexed directories.
- Consider: progress bar or spinner during re-index.

### 8. Update gaps.md and plan.md
- Mark "Phase 3b — Full System Search" items as done.
- Update cross-platform gaps if any were addressed.
- Remove completed items from gaps.

## Performance Considerations

- **Index size**: ~200k entries at ~280 bytes each = ~56 MB. Acceptable for a desktop app. Monitor with `index_stats`.
- **Walk time**: Full `~/` walk with exclusions: 2–5 seconds on SSD. Users see cached results instantly; walk happens in background.
- **Watcher overhead**: `notify` uses OS-native APIs (FSEvents on macOS, inotify on Linux, ReadDirectoryChangesW on Windows). Negligible CPU/memory.
- **Lock contention**: Watcher writes are batched and infrequent (~1/sec max). Search reads are fast (<10ms). Contention is minimal with `RwLock` (many readers, rare writer).
- **Cache I/O**: 30 MB bincode read takes <200ms. Acceptable for cold start — user sees results before the background walk even begins.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `~/` scope indexes too many files (>500k) | Aggressive exclusions. Log warnings if entry count exceeds 300k. Config override to restrict scope. |
| `notify` watcher hits OS limits (e.g., inotify max_user_watches on Linux) | Document the issue. Fall back to periodic re-walk if watcher fails to start. Don't crash. |
| Cache file corruption | Validate version stamp + config hash on load. Any deserialization error → discard cache, full re-walk. |
| Lock contention between watcher writes and search reads | Batch watcher events. Acquire write lock once per batch, not per event. `RwLock` allows concurrent reads. |
| Platform differences in `notify` behavior | Use `notify-debouncer-full` for consistent cross-platform semantics. Test on all three platforms in CI. |

## Dependencies (new)

| Crate | Purpose | Status |
|---|---|---|
| `indexmap` | Ordered hash map for index storage | New |
| `bincode` | Fast binary serialization for cache | New |
| `notify-debouncer-full` | Cross-platform debounced fs events | New (replaces raw `notify` usage) |
| `dirs` | Platform cache directory resolution | Already used (verify) |

## Notes

- The `notify` crate is already in `Cargo.toml` but unused. We'll use it through `notify-debouncer-full` which wraps it with debouncing and cross-platform normalization.
- `nucleo` search remains O(n) per query. At 200k entries this is still <10ms — well within the sub-keystroke target. If we ever need to go beyond 500k entries, consider nucleo's `Nucleo` parallel matcher (thread pool) instead of the single-threaded `Pattern::score` loop.
- Content search (searching inside files) is explicitly out of scope for this task. It's a separate feature that would require a different indexing strategy (trigram index, ripgrep integration, etc.).
- The `FileEntry` struct doesn't change shape — just the container around it. This minimizes downstream breakage.
