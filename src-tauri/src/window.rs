//! Window management helpers for the main launcher overlay.

use tauri::{AppHandle, Manager};

/// The label assigned to the main launcher window in `tauri.conf.json`.
const MAIN_WINDOW_LABEL: &str = "main";

/// Toggle the main window visibility.
///
/// Shows (centered + focused) when hidden, hides when visible.
pub fn toggle(app: &AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;

    if win.is_visible().map_err(|e| e.to_string())? {
        win.hide().map_err(|e| e.to_string())
    } else {
        win.center().map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())
    }
}

/// Show the main window — center it, make it visible, and focus it.
pub fn show(app: &AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;
    win.center().map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())
}

/// Hide the main window.
pub fn hide(app: &AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;
    win.hide().map_err(|e| e.to_string())
}

/// Retrieve the main `WebviewWindow` by label.
fn get_main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("window '{MAIN_WINDOW_LABEL}' not found"))
}
