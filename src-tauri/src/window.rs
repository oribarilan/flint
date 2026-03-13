//! Window management helpers for the main launcher overlay.

use tauri::{AppHandle, Manager, WebviewUrl};

use crate::error::StringResult;

/// The label assigned to the main launcher window in `tauri.conf.json`.
const MAIN_WINDOW_LABEL: &str = "main";
/// The label for the settings window (created dynamically).
const SETTINGS_WINDOW_LABEL: &str = "settings";

/// Toggle the main window visibility.
///
/// Shows (centered + focused) when hidden, hides when visible.
pub fn toggle(app: &AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;

    if win.is_visible().str_err()? {
        win.hide().str_err()
    } else {
        win.center().str_err()?;
        win.show().str_err()?;
        win.set_focus().str_err()
    }
}

/// Show the main window — center it, make it visible, and focus it.
pub fn show(app: &AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;
    win.center().str_err()?;
    win.show().str_err()?;
    win.set_focus().str_err()
}

/// Hide the main window.
pub fn hide(app: &AppHandle) -> Result<(), String> {
    let win = get_main_window(app)?;
    win.hide().str_err()
}

/// Retrieve the main `WebviewWindow` by label.
fn get_main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| format!("window '{MAIN_WINDOW_LABEL}' not found"))
}

/// Open the settings window, or focus it if already open.
pub fn open_settings(app: &AppHandle) -> Result<(), String> {
    // If already open, just focus it.
    if let Some(win) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        win.show().str_err()?;
        win.set_focus().str_err()?;
        return Ok(());
    }

    // Create a new settings window loading the same frontend with ?page=settings.
    let url = WebviewUrl::App("index.html?page=settings".into());

    tauri::WebviewWindowBuilder::new(app, SETTINGS_WINDOW_LABEL, url)
        .title("Flint Settings")
        .inner_size(480.0, 400.0)
        .resizable(false)
        .center()
        .build()
        .str_err()?;

    Ok(())
}
