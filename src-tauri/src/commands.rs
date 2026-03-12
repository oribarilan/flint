//! Tauri IPC commands for window management, file search, and file opening.

use tauri::{AppHandle, State};

use crate::indexer::FileIndex;
use crate::search::SearchResult;
use crate::window;

// ---------------------------------------------------------------------------
// Window commands
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Search commands
// ---------------------------------------------------------------------------

/// Fuzzy-search the file index and return up to 20 matching results.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn search_files(
    query: String,
    index: State<'_, FileIndex>,
) -> Result<Vec<SearchResult>, String> {
    let entries = index.0.read().map_err(|e| e.to_string())?;
    Ok(crate::search::search(&query, &entries, 20))
}

/// Open a file or application at `path` with the system default handler.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri deserialises into owned String
pub fn open_file(path: String) -> Result<(), String> {
    open_with_system(&path).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Platform-specific open helpers
// ---------------------------------------------------------------------------

/// Launch the system default handler for the given path.
fn open_with_system(path: &str) -> Result<(), std::io::Error> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd").args(["/C", "start", "", path]).spawn()?;
    }

    Ok(())
}
