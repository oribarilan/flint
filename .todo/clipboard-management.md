# Clipboard Management

## Summary

Add clipboard history and management to Flint. Track clipboard entries over time, let users search through their clipboard history from the launcher, and paste previous entries. This turns Flint into a productivity hub alongside file search and AI chat.

## Context

Flint currently has zero clipboard functionality — no plugins, no dependencies, no code. This is a net-new feature.

Tauri v2 ecosystem has `tauri-plugin-clipboard-manager` for basic read/write. For clipboard *history*, we need to monitor the system clipboard continuously and store entries ourselves.

### Current stack involved (for integration)

- **`src-tauri/src/lib.rs`** — plugin registration, Tauri app setup
- **`src-tauri/src/commands.rs`** — IPC command handlers
- **`src/lib/commands.ts`** — TypeScript IPC wrappers
- **`src/stores/searchStore.ts`** — search mode and result types
- **`src-tauri/Cargo.toml`** — Rust dependencies

## Implementation Plan

### Phase 1: Clipboard monitoring & history storage

#### Step 1: Dependencies

Add to `src-tauri/Cargo.toml`:
```toml
tauri-plugin-clipboard-manager = "2"
# Or use arboard crate directly for more control:
arboard = "3"
```

Evaluate trade-offs:
- `tauri-plugin-clipboard-manager` — simple read/write, integrates with Tauri plugin system, but may not support polling/watching
- `arboard` — cross-platform clipboard access (read/write text & images), no watching built-in but reliable
- For *watching*, we'll likely need a polling loop regardless (no universal clipboard change notification across platforms)

#### Step 2: Clipboard watcher — `src-tauri/src/clipboard.rs`

A background task that polls the system clipboard at a short interval (~500ms) and detects changes:

```rust
pub struct ClipboardEntry {
    pub id: u64,
    pub content: ClipboardContent,
    pub source_app: Option<String>,  // App that owns the clipboard (if detectable)
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub pinned: bool,
}

pub enum ClipboardContent {
    Text(String),
    Image { width: u32, height: u32, data: Vec<u8> },
    // Rich text, files, etc. — future
}
```

The watcher:
1. Runs as a `tokio::spawn` task started during app setup
2. Polls clipboard every ~500ms
3. Compares content hash against last known entry
4. On change, pushes to an in-memory ring buffer (and optional persistent store)
5. De-duplicates consecutive identical entries
6. Caps history at N entries (configurable, default: 200)

#### Step 3: History storage

**In-memory (MVP):** `Arc<RwLock<VecDeque<ClipboardEntry>>>` — fast, simple, lost on app restart.

**Persistent (Phase 2):** SQLite database at `~/.config/flint/clipboard.db` for history across sessions. Text entries stored directly, images stored as file references. Configurable retention period.

Start with in-memory for MVP.

#### Step 4: IPC commands

```rust
#[tauri::command]
pub fn get_clipboard_history(limit: usize) -> Result<Vec<ClipboardEntry>, String>

#[tauri::command]
pub fn search_clipboard(query: String) -> Result<Vec<ClipboardEntry>, String>

#[tauri::command]
pub fn paste_clipboard_entry(id: u64) -> Result<(), String>
// Writes entry back to system clipboard so user can Cmd+V

#[tauri::command]
pub fn delete_clipboard_entry(id: u64) -> Result<(), String>

#[tauri::command]
pub fn pin_clipboard_entry(id: u64) -> Result<(), String>

#[tauri::command]
pub fn clear_clipboard_history() -> Result<(), String>
```

#### Step 5: Config

Add to `FlintConfig`:
```rust
pub struct ClipboardConfig {
    pub enabled: bool,           // default: true
    pub max_history: usize,      // default: 200
    pub track_images: bool,      // default: true
    pub excluded_apps: Vec<String>, // apps to ignore (e.g., password managers)
}
```

Add a "Clipboard" page to Settings.

### Phase 2: Frontend — clipboard in the launcher

#### Option A: Unified search with prefix

Use a prefix like `@` or a mode to switch to clipboard search:
- Type normally → file search
- Type `@` or press a shortcut → clipboard history mode
- Fuzzy search over clipboard text entries

#### Option B: Dedicated mode

Add a third mode alongside "search" and "chat":
- `"search" | "chat" | "clipboard"`
- Accessible via a keyboard shortcut or icon in the search bar
- Shows clipboard history as a scrollable list, searchable

Recommendation: Start with Option A (prefix-based) for simplicity, upgrade to a full mode later.

#### Step 6: Clipboard result rendering

- Show text preview (truncated to ~100 chars)
- Show timestamp ("2 min ago", "1 hour ago")
- Show source app if available
- Pinned entries at top
- Image entries show a small thumbnail
- On select: write to clipboard + hide Flint (user can then Cmd+V)
- Delete action: remove from history (swipe or secondary action)

#### Step 7: Tests

- Rust: watcher detects changes, de-duplication works, ring buffer caps correctly, search matches
- Frontend: clipboard results render, select action writes to clipboard, pin/delete work

### Phase 3: Polish (future)

- **Persistent history** via SQLite — survives app restarts
- **Image clipboard support** — store and preview images
- **Rich text support** — preserve formatting
- **Snippet saving** — promote clipboard entries to saved snippets
- **Sensitive content detection** — auto-clear entries that look like passwords/tokens after a timeout
- **Cross-device sync** — far future, if ever

## Design Considerations

- **Privacy**: Clipboard often contains sensitive data (passwords, tokens, personal info). Must provide:
  - Easy way to disable clipboard tracking entirely
  - App exclusion list (e.g., exclude 1Password, Bitwarden)
  - Quick "clear all" action
  - Auto-expiry for old entries
- **Performance**: Polling at 500ms is lightweight. Don't hash large image data every cycle — compare a size+timestamp fingerprint first.
- **Memory**: Cap the in-memory buffer. Text entries are small; images need size limits or file-backed storage.
- **Platform differences**:
  - macOS: clipboard change count via `NSPasteboard.changeCount` (avoids content comparison)
  - Windows: `AddClipboardFormatListener` for change notifications (no polling needed)
  - Linux: X11 clipboard is selection-based; Wayland has `wl-clipboard`
  Use platform-specific efficient notification where available, fall back to polling.

## Out of Scope

- Clipboard sync between devices
- Clipboard sharing / collaboration
- OCR on clipboard images
- Clipboard rules/transformations (e.g., auto-trim whitespace)
