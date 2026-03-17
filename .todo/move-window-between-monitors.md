# Move Window Between Monitors

## Summary

Extend Flint's window management with commands to move the focused window to the right or left monitor. This adds spatial monitor navigation as a quick action, turning Flint into a lightweight window management tool.

## Context

The existing window management exploration (`.todo/explore/window-management.md`) covers listing and focusing windows. This task adds **positional actions** — moving a window across monitors — which is independent of window search and can be implemented as standalone commands triggered via Flint's search/command interface.

### Platform APIs for monitor enumeration & window positioning

| Platform | Monitor Enumeration | Window Positioning |
|----------|--------------------|--------------------|
| **macOS** | `CGGetActiveDisplayList` / `NSScreen.screens` | `AXUIElement` — set `kAXPositionAttribute` and `kAXSizeAttribute` |
| **Windows** | `EnumDisplayMonitors` | `SetWindowPos` / `MoveWindow` |
| **Linux (X11)** | `XRRGetScreenResources` / `xrandr` | `XMoveResizeWindow` / `wmctrl -e` |
| **Linux (Wayland)** | Compositor-specific (wlr-output-management) | Limited — no universal protocol for moving other apps' windows |

## Requirements

1. **Detect monitors** — enumerate connected displays with their position, size, and arrangement (logical coordinates).
2. **Get focused window** — identify the currently focused window and its current monitor.
3. **Move to right monitor** — move the focused window to the next monitor to the right, preserving relative position and size.
4. **Move to left monitor** — move the focused window to the next monitor to the left, preserving relative position and size.
5. **Wrap behavior** — decide: wrap around (rightmost → leftmost) or no-op at edges. Recommend: no-op with a subtle indicator.
6. **Multi-monitor layouts** — handle non-trivial arrangements (vertical stacking, offset monitors). Use horizontal center of the monitor to determine left/right ordering.
7. **Surface as commands** — these should be invocable from Flint's command palette or as kit actions, not just programmatic APIs.

## Implementation Plan

### Step 1: Monitor enumeration — `src-tauri/src/platform/monitors.rs`

```rust
pub struct Monitor {
    pub id: u64,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

pub fn list_monitors() -> Result<Vec<Monitor>, Error> { ... }
```

Sort monitors by `x` coordinate (horizontal center) to define left-right ordering.

### Step 2: Focused window info — extend `platform/windows.rs`

```rust
pub struct WindowRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn get_focused_window() -> Result<(SystemWindow, WindowRect), Error> { ... }
```

### Step 3: Move logic

Determine which monitor the focused window is on (by center point), find the adjacent monitor in the requested direction, compute the new position preserving relative offset and clamping to monitor bounds, then apply the move.

```rust
pub fn move_window_to_monitor(window_id: u64, target_monitor: &Monitor, current_rect: &WindowRect, current_monitor: &Monitor) -> Result<(), Error> { ... }
```

### Step 4: IPC commands

```rust
#[tauri::command]
pub fn move_focused_window_right() -> Result<(), String>

#[tauri::command]
pub fn move_focused_window_left() -> Result<(), String>
```

Each command orchestrates: get focused window → determine current monitor → find adjacent monitor → move.

### Step 5: Surface in UI

Register these as kit actions or command palette entries so users can trigger them from Flint's search bar (e.g., typing "move window right").

### Step 6: Tests

- Unit tests for monitor sorting/ordering logic.
- Unit tests for position calculation (relative offset preservation, clamping, edge cases with different monitor sizes/scales).
- Mock-based tests for the orchestration commands.

## Design Considerations

- **Permissions**: macOS requires Accessibility permissions to move other apps' windows. Reuse the permission flow from window management.
- **HiDPI / scaling**: Monitor coordinates are in logical points on macOS, physical pixels on some Linux setups. Normalize to logical coordinates.
- **Performance**: These are user-triggered one-shot actions, not hot paths. No performance concerns.
- **Cross-platform priority**: macOS first, then Windows, then Linux (Wayland support may be limited).

## Notes

- This pairs well with global hotkey bindings (e.g., `Ctrl+Opt+Right` / `Ctrl+Opt+Left`) but hotkey registration is a separate concern.
- Consider extending to "move to monitor N" in the future for setups with 3+ monitors.
- Wayland's security model may prevent moving other apps' windows. Document this limitation rather than working around it.
