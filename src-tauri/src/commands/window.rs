//! Tauri IPC commands for window management.

use tauri::AppHandle;

use crate::window;

/// Toggle the main window visibility.
///
/// If the window is currently visible, it will be hidden.
/// If hidden, it will be centered and shown with focus.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri injects AppHandle by value
pub fn toggle_window(app: AppHandle) -> Result<(), String> {
    window::toggle(&app)
}

/// Show and focus the main window.
///
/// Centers the window on the current screen before showing.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn show_window(app: AppHandle) -> Result<(), String> {
    window::show(&app)
}

/// Hide the main window.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    window::hide(&app)
}

/// Open the settings window.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    window::open_settings(&app)
}
