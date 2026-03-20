//! Window Management kit — tiling commands for the focused window.
//!
//! Provides Execute-mode commands to tile the frontmost window:
//! maximize, left half, and right half of the usable screen area
//! (excluding menu bar and dock).

use async_trait::async_trait;

use super::{CommandDef, CommandMode, CommandOutput, Kit, KitError, KitIcon, KitManifest};

// ---------------------------------------------------------------------------
// Icons — minimal SVGs for each tiling layout
// ---------------------------------------------------------------------------

/// Kit-level icon: a window outline with a title bar.
const KIT_ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><line x1="2" y1="7" x2="18" y2="7"/><circle cx="4.5" cy="5" r="0.7" fill="currentColor" stroke="none"/><circle cx="7" cy="5" r="0.7" fill="currentColor" stroke="none"/></svg>"#;

/// Maximize: full window filling the frame.
const MAXIMIZE_ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><rect x="3.5" y="4.5" width="13" height="11" rx="1" fill="currentColor" opacity="0.15"/></svg>"#;

/// Left half: left portion highlighted.
const LEFT_HALF_ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><rect x="3.5" y="4.5" width="6" height="11" rx="1" fill="currentColor" opacity="0.2"/></svg>"#;

/// Right half: right portion highlighted.
const RIGHT_HALF_ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><rect x="10.5" y="4.5" width="6" height="11" rx="1" fill="currentColor" opacity="0.2"/></svg>"#;

fn icon_from_svg(svg: &str) -> KitIcon {
    KitIcon::DataUri(format!("data:image/svg+xml,{}", urlencoding::encode(svg)))
}

// ---------------------------------------------------------------------------
// Tile layout
// ---------------------------------------------------------------------------

/// Target layout for the tiling operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TileLayout {
    Maximize,
    LeftHalf,
    RightHalf,
}

// ---------------------------------------------------------------------------
// Kit implementation
// ---------------------------------------------------------------------------

/// Tiles the frontmost window to a predefined screen region.
///
/// Commands are Execute-mode: they run immediately with no sub-search flow.
/// No default hotkeys or prefixes — users assign these through Settings.
pub struct WindowManagementKit {
    manifest: KitManifest,
}

impl WindowManagementKit {
    pub fn new() -> Self {
        Self {
            manifest: KitManifest {
                id: "window-management",
                name: "Window Management",
                description: "Tile and position windows",
                icon: icon_from_svg(KIT_ICON_SVG),
            },
        }
    }
}

impl Default for WindowManagementKit {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Kit for WindowManagementKit {
    fn manifest(&self) -> &KitManifest {
        &self.manifest
    }

    fn commands(&self) -> Vec<CommandDef> {
        vec![
            CommandDef {
                id: "maximize",
                name: "Maximize Window",
                description: "Fill the screen with the focused window",
                icon: icon_from_svg(MAXIMIZE_ICON_SVG),
                mode: CommandMode::Execute,
                default_prefix: None,
                default_hotkey: None,
            },
            CommandDef {
                id: "left-half",
                name: "Left Half",
                description: "Tile the focused window to the left half",
                icon: icon_from_svg(LEFT_HALF_ICON_SVG),
                mode: CommandMode::Execute,
                default_prefix: None,
                default_hotkey: None,
            },
            CommandDef {
                id: "right-half",
                name: "Right Half",
                description: "Tile the focused window to the right half",
                icon: icon_from_svg(RIGHT_HALF_ICON_SVG),
                mode: CommandMode::Execute,
                default_prefix: None,
                default_hotkey: None,
            },
        ]
    }

    async fn execute(&self, command_id: &str) -> Result<CommandOutput, KitError> {
        let layout = match command_id {
            "maximize" => TileLayout::Maximize,
            "left-half" => TileLayout::LeftHalf,
            "right-half" => TileLayout::RightHalf,
            other => return Err(KitError::CommandNotFound(other.to_string())),
        };

        tracing::debug!(command = %command_id, "executing window tile");

        #[cfg(target_os = "windows")]
        {
            platform::tile_window(layout).map_err(KitError::Internal)?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            platform::tile_window(layout).await.map_err(KitError::Internal)?;
        }

        Ok(CommandOutput::Done)
    }
}

// ---------------------------------------------------------------------------
// macOS — JXA via osascript
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod platform {
    use super::TileLayout;

    /// Tile the frontmost window using a JXA script executed via `osascript`.
    ///
    /// Coordinates are converted from Cocoa (bottom-left origin) to
    /// System Events (top-left origin) using the primary screen height.
    pub async fn tile_window(layout: TileLayout) -> Result<(), String> {
        let script = build_jxa_script(layout);

        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new("osascript")
                .args(["-l", "JavaScript", "-e", &script])
                .output()
        })
        .await
        .map_err(|e| format!("task join failed: {e}"))?
        .map_err(|e| format!("failed to run osascript: {e}"))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("window tile failed: {}", stderr.trim()))
        }
    }

    /// Build a JXA script that tiles the frontmost window.
    ///
    /// The script uses `NSScreen.mainScreen.visibleFrame` for accurate
    /// screen bounds that exclude the menu bar and dock, then converts
    /// from Cocoa's bottom-left coordinate system to System Events'
    /// top-left coordinate system.
    fn build_jxa_script(layout: TileLayout) -> String {
        let position_and_size = match layout {
            TileLayout::Maximize => "win.position = [x, y]; win.size = [w, h];",
            TileLayout::LeftHalf => {
                "var hw = Math.round(w / 2); win.position = [x, y]; win.size = [hw, h];"
            }
            TileLayout::RightHalf => {
                "var hw = Math.round(w / 2); \
                 win.position = [x + hw, y]; \
                 win.size = [w - hw, h];"
            }
        };

        format!(
            r"(function() {{
  ObjC.import('AppKit');
  var se = Application('System Events');
  var procs = se.processes.whose({{ frontmost: true }});
  if (procs.length === 0) throw new Error('no frontmost process');
  var proc = procs[0];
  if (proc.windows.length === 0) throw new Error('no windows for frontmost process');
  var win = proc.windows[0];

  var screens = $.NSScreen.screens;
  var primaryH = screens.objectAtIndex(0).frame.size.height;
  var ms = $.NSScreen.mainScreen;
  var vf = ms.visibleFrame;

  var x = vf.origin.x;
  var y = primaryH - vf.origin.y - vf.size.height;
  var w = vf.size.width;
  var h = vf.size.height;

  {position_and_size}
  return 'ok';
}})()"
        )
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn jxa_script_contains_maximize_assignment() {
            let script = build_jxa_script(TileLayout::Maximize);
            assert!(script.contains("win.size = [w, h]"));
            assert!(script.contains("win.position = [x, y]"));
        }

        #[test]
        fn jxa_script_contains_left_half_assignment() {
            let script = build_jxa_script(TileLayout::LeftHalf);
            assert!(script.contains("win.size = [hw, h]"));
            assert!(script.contains("win.position = [x, y]"));
            assert!(script.contains("Math.round(w / 2)"));
        }

        #[test]
        fn jxa_script_contains_right_half_assignment() {
            let script = build_jxa_script(TileLayout::RightHalf);
            assert!(script.contains("win.position = [x + hw, y]"));
            assert!(script.contains("win.size = [w - hw, h]"));
        }

        #[test]
        fn jxa_script_imports_appkit() {
            let script = build_jxa_script(TileLayout::Maximize);
            assert!(script.contains("ObjC.import('AppKit')"));
        }

        #[test]
        fn jxa_script_converts_coordinates() {
            let script = build_jxa_script(TileLayout::Maximize);
            // Verifies Cocoa → System Events coordinate conversion is present.
            assert!(script.contains("primaryH - vf.origin.y - vf.size.height"));
        }
    }
}

// ---------------------------------------------------------------------------
// Linux — xdotool
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod platform {
    use super::TileLayout;

    /// Tile the active window using `xdotool` and `xdpyinfo`.
    ///
    /// Uses display geometry for screen bounds. Does not account for
    /// desktop panels — a known limitation for V1.
    pub async fn tile_window(layout: TileLayout) -> Result<(), String> {
        tokio::task::spawn_blocking(move || tile_window_blocking(layout))
            .await
            .map_err(|e| format!("task join failed: {e}"))?
    }

    fn tile_window_blocking(layout: TileLayout) -> Result<(), String> {
        let window_id = get_active_window()?;
        let (screen_w, screen_h) = get_display_geometry()?;

        // Remove maximized state so we can reposition freely.
        run_xdotool(&["windowstate", "--remove", "MAXIMIZED_VERT,MAXIMIZED_HORZ", &window_id])?;

        let (x, y, w, h) = match layout {
            TileLayout::Maximize => (0, 0, screen_w, screen_h),
            TileLayout::LeftHalf => (0, 0, screen_w / 2, screen_h),
            TileLayout::RightHalf => (screen_w / 2, 0, screen_w - screen_w / 2, screen_h),
        };

        run_xdotool(&["windowmove", "--sync", &window_id, &x.to_string(), &y.to_string()])?;
        run_xdotool(&["windowsize", "--sync", &window_id, &w.to_string(), &h.to_string()])?;

        Ok(())
    }

    fn get_active_window() -> Result<String, String> {
        let output = std::process::Command::new("xdotool")
            .arg("getactivewindow")
            .output()
            .map_err(|e| format!("xdotool not found: {e}"))?;

        if !output.status.success() {
            return Err("no active window".to_string());
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    fn get_display_geometry() -> Result<(i32, i32), String> {
        let output = std::process::Command::new("xdotool")
            .arg("getdisplaygeometry")
            .output()
            .map_err(|e| format!("xdotool not found: {e}"))?;

        let text = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = text.split_whitespace().collect();
        if parts.len() < 2 {
            return Err(format!("unexpected xdotool output: {text}"));
        }

        let w = parts[0].parse::<i32>().map_err(|e| format!("bad width: {e}"))?;
        let h = parts[1].parse::<i32>().map_err(|e| format!("bad height: {e}"))?;
        Ok((w, h))
    }

    fn run_xdotool(args: &[&str]) -> Result<(), String> {
        let output = std::process::Command::new("xdotool")
            .args(args)
            .output()
            .map_err(|e| format!("xdotool failed: {e}"))?;

        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("xdotool error: {}", stderr.trim()))
        }
    }
}

// ---------------------------------------------------------------------------
// Windows (stub)
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod platform {
    use super::TileLayout;

    /// Stub — Windows support requires the `windows` crate for
    /// `SetWindowPos` / `GetForegroundWindow`.
    pub fn tile_window(_layout: TileLayout) -> Result<(), String> {
        Err("window tiling is not yet supported on Windows".to_string())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kits::Kit;

    #[test]
    fn manifest_has_correct_id() {
        let kit = WindowManagementKit::new();
        assert_eq!(kit.manifest().id, "window-management");
    }

    #[test]
    fn manifest_has_correct_name() {
        let kit = WindowManagementKit::new();
        assert_eq!(kit.manifest().name, "Window Management");
    }

    #[test]
    fn exposes_three_commands() {
        let kit = WindowManagementKit::new();
        let cmds = kit.commands();
        assert_eq!(cmds.len(), 3);
    }

    #[test]
    fn all_commands_are_execute_mode() {
        let kit = WindowManagementKit::new();
        for cmd in kit.commands() {
            assert_eq!(cmd.mode, CommandMode::Execute, "command {} should be Execute", cmd.id);
        }
    }

    #[test]
    fn no_commands_have_default_prefix() {
        let kit = WindowManagementKit::new();
        for cmd in kit.commands() {
            assert!(
                cmd.default_prefix.is_none(),
                "command {} should not have a default prefix",
                cmd.id
            );
        }
    }

    #[test]
    fn no_commands_have_default_hotkey() {
        let kit = WindowManagementKit::new();
        for cmd in kit.commands() {
            assert!(
                cmd.default_hotkey.is_none(),
                "command {} should not have a default hotkey",
                cmd.id
            );
        }
    }

    #[test]
    fn command_ids_are_correct() {
        let kit = WindowManagementKit::new();
        let ids: Vec<&str> = kit.commands().iter().map(|c| c.id).collect();
        assert_eq!(ids, vec!["maximize", "left-half", "right-half"]);
    }

    #[tokio::test]
    async fn execute_unknown_command_returns_error() {
        let kit = WindowManagementKit::new();
        let result = kit.execute("nonexistent").await;
        assert!(result.is_err());
        match result.unwrap_err() {
            KitError::CommandNotFound(id) => assert_eq!(id, "nonexistent"),
            other => panic!("expected CommandNotFound, got {other:?}"),
        }
    }
}
