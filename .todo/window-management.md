# Window Management

## Summary

Add window management capabilities to Flint: search and switch to open windows, and potentially offer quick tiling/arrangement actions. This extends Flint from a file/app launcher into a workspace navigation tool.

## Context

Flint currently searches files, directories, and applications (macOS `.app` bundles). The search result type (`EntryKind`) is `File | Directory | Application`. There is no awareness of open system windows.

The app's own window management (`src-tauri/src/window.rs`) handles show/hide/toggle of the launcher overlay and opening the settings window. This is unrelated to system-level window management.

### Current stack involved

- **`src-tauri/src/search.rs`** — fuzzy search over `FileIndex` using `nucleo`
- **`src-tauri/src/indexer.rs`** — `EntryKind` enum (`File`, `Directory`, `Application`)
- **`src/stores/searchStore.ts`** — `SearchResult` type with `kind: "file" | "directory" | "application"`
- **`src-tauri/src/commands.rs`** — `search_files` command
- **`src-tauri/src/window.rs`** — app window management (show/hide/toggle/settings)

### Platform APIs for window listing

| Platform | API | Notes |
|----------|-----|-------|
| **macOS** | `CGWindowListCopyWindowInfo` (Core Graphics) | Lists all on-screen windows with title, owning app, bounds, layer |
| **macOS** | Accessibility API (`AXUIElement`) | Can focus/raise/minimize specific windows |
| **macOS** | NSWorkspace (`running_applications`) | List running apps |
| **Windows** | `EnumWindows` (Win32) | Enumerates all top-level windows |
| **Windows** | `SetForegroundWindow` | Focus/raise a specific window |
| **Linux** | `wmctrl` / `xdotool` (X11) | List and manipulate windows |
| **Linux** | `wlr-foreign-toplevel` (Wayland) | Protocol for window listing on Wayland compositors |

Cross-platform crates to evaluate:
- **`active-win-pos-rs`** — get active window info
- **`window_titles`** — list window titles (limited)
- Manual platform-specific code via `#[cfg]` blocks is likely needed for full control

## Implementation Plan

### Phase 1: Window listing & search

#### Step 1: Platform module — `src-tauri/src/platform/windows.rs` (or `mod window_list`)

Create a cross-platform abstraction for listing open windows:

```rust
pub struct SystemWindow {
    pub id: u64,           // Platform-specific window ID
    pub title: String,     // Window title
    pub app_name: String,  // Owning application name
    pub app_pid: u32,      // Process ID
}

pub fn list_windows() -> Result<Vec<SystemWindow>, Error> {
    #[cfg(target_os = "macos")]
    { /* CGWindowListCopyWindowInfo */ }

    #[cfg(target_os = "windows")]
    { /* EnumWindows */ }

    #[cfg(target_os = "linux")]
    { /* X11/Wayland approach */ }
}
```

Filter out:
- Flint's own windows
- Windows with empty titles
- Desktop/dock/menu bar windows (macOS layer filtering)
- Invisible or minimized windows (optional: include minimized with indicator)

#### Step 2: Window focus/raise

```rust
pub fn focus_window(window_id: u64) -> Result<(), Error> {
    #[cfg(target_os = "macos")]
    { /* AXUIElement setFrontmost + AXRaise */ }

    #[cfg(target_os = "windows")]
    { /* SetForegroundWindow */ }

    #[cfg(target_os = "linux")]
    { /* wmctrl / xdotool */ }
}
```

#### Step 3: Extend search results

Add `Window` to `EntryKind`:

```rust
pub enum EntryKind {
    File,
    Directory,
    Application,
    Window,
}
```

And the frontend `SearchResult.kind`:
```typescript
kind: "file" | "directory" | "application" | "window"
```

#### Step 4: Integrate into search

Option A — **Unified search**: Query both the file index and the live window list, merge results. Windows could be ranked lower or shown in a separate section.

Option B — **Mode-based**: A prefix or modifier to switch to window search (e.g., `>` prefix like VS Code). Keeps file search fast and uncluttered.

Recommendation: Start with unified search, but show windows in a distinct visual group (different icon, subtle label). Window search is always live (no index), so it runs on each keystroke against the current window list.

#### Step 5: IPC commands

```rust
#[tauri::command]
pub fn list_open_windows() -> Result<Vec<SystemWindow>, String>

#[tauri::command]
pub fn focus_open_window(window_id: u64) -> Result<(), String>
```

#### Step 6: Frontend — result rendering

- Window results get a distinct icon (window/app icon if extractable, or a generic window icon)
- Show `"App Name — Window Title"` as the display text
- On select: call `focus_open_window(id)` + hide Flint overlay

#### Step 7: Tests

- Rust unit tests: mock window list, filter logic, search matching
- Frontend: window result rendering, action dispatch

### Phase 2: Window actions (future, lower priority)

Quick actions on window results:
- **Close window**: send close event to the target window
- **Minimize/maximize**: toggle window state
- **Move to space/desktop**: macOS Spaces / Windows virtual desktops
- **Tiling**: snap left/right/maximize (would need window positioning APIs)

These could surface as secondary actions (e.g., right-arrow or tab to expand action menu on a selected window result).

## Design Considerations

- **Performance**: Window listing should be fast (<50ms). Don't index windows — query live each time.
- **Permissions**: macOS may require Accessibility permissions for focusing other apps' windows. Handle the permission prompt gracefully.
- **Freshness**: Window list is stale the moment it's fetched. Accept this — it's the same as Spotlight/Alfred.
- **Cross-platform parity**: Start with macOS (primary dev platform), then Windows, then Linux. Use `#[cfg]` blocks per the crossplatform skill.
- **Icon extraction**: Getting the app icon for window results is nice but complex cross-platform. Start with a generic window icon; add per-app icons later.

## Out of Scope

- Virtual desktop / Spaces management
- Window snapping / tiling layouts (separate feature if ever)
- Window previews / thumbnails
- Always-on-top toggling for other windows
