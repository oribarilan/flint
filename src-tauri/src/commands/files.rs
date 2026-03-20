//! Tauri IPC commands for file operations (open, reveal, delete, editor, icon).

use tauri::State;

use crate::config::{AppConfig, FlintConfig};

// ---------------------------------------------------------------------------
// Public commands
// ---------------------------------------------------------------------------

/// Open a file or application at `path` with the system default handler.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri deserialises into owned String
pub fn open_file(path: String) -> Result<(), String> {
    let canonical = canonicalize_path(&path)?;
    open_with_system(&canonical.to_string_lossy()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reveal a file or directory in the OS file manager.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let canonical = canonicalize_path(&path)?;
    reveal_path_in_file_manager(&canonical.to_string_lossy())
}

/// Delete a file or directory by moving it to the OS trash.
///
/// Restricted to paths within indexed directories to limit blast radius.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn delete_to_trash(path: String, config: State<'_, AppConfig>) -> Result<(), String> {
    let canonical = canonicalize_path(&path)?;
    validate_path_in_indexed_dirs(&canonical, &config.get())?;
    trash::delete(&canonical).map_err(|e| format!("failed to trash '{}': {e}", canonical.display()))
}

/// Open a file in the user's configured editor.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn open_in_editor(path: String, config: State<'_, AppConfig>) -> Result<(), String> {
    let canonical = canonicalize_path(&path)?;
    let editor = resolve_editor(&config.get().general.editor);
    let Some(cmd) = editor else {
        return Err("no editor configured and none detected from environment".to_string());
    };
    std::process::Command::new(&cmd)
        .arg(&canonical)
        .spawn()
        .map_err(|e| format!("failed to open editor '{cmd}': {e}"))?;
    Ok(())
}

/// Open a terminal at the given directory.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn open_in_terminal(path: String, config: State<'_, AppConfig>) -> Result<(), String> {
    // TODO: Implement reliable cross-platform terminal launch.
    // See .todo/explore/open-in-terminal.md for details.
    let _ = (&path, &config);
    Err("Open in Terminal is not yet supported. Configure your terminal in Settings.".to_string())
}

/// Extract the application icon for a macOS `.app` bundle.
///
/// Returns a `data:image/png;base64,…` URI, or `null` if unavailable.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn get_app_icon(path: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        crate::icons::extract_app_icon(&path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        None
    }
}

// ---------------------------------------------------------------------------
// Path helpers (shared with config module via pub(super))
// ---------------------------------------------------------------------------

/// Canonicalize a path received from the frontend.
///
/// Resolves symlinks and `..` components, ensuring the path is absolute and
/// the target actually exists on disk.
pub(super) fn canonicalize_path(path: &str) -> Result<std::path::PathBuf, String> {
    std::fs::canonicalize(path).map_err(|e| format!("invalid path '{path}': {e}"))
}

/// Validate that a canonical path falls within one of the configured indexed
/// directories. Used for destructive operations (delete) to limit blast radius.
pub(super) fn validate_path_in_indexed_dirs(
    canonical: &std::path::Path,
    config: &FlintConfig,
) -> Result<(), String> {
    let home = dirs::home_dir();
    let allowed: Vec<std::path::PathBuf> = config
        .search
        .directories
        .iter()
        .filter_map(|d| {
            let path = if let Some(rest) = d.strip_prefix("~/") {
                home.as_ref()?.join(rest)
            } else if d == "~" {
                home.clone()?
            } else {
                std::path::PathBuf::from(d)
            };
            std::fs::canonicalize(&path).ok()
        })
        .collect();

    if allowed.iter().any(|dir| canonical.starts_with(dir)) {
        return Ok(());
    }

    Err(format!("path '{}' is outside indexed directories", canonical.display()))
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

/// Reveal a path in the platform file manager, selecting it.
fn reveal_path_in_file_manager(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").args(["-R", path]).spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        // DBus method to select the file; falls back to opening the parent.
        let parent = std::path::Path::new(path)
            .parent()
            .map_or_else(|| path.to_string(), |p| p.to_string_lossy().to_string());
        std::process::Command::new("xdg-open").arg(&parent).spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Resolve the editor command from config value, falling back to env vars.
pub(super) fn resolve_editor(config_value: &str) -> Option<String> {
    if config_value != "auto" {
        return Some(config_value.to_string());
    }
    std::env::var("VISUAL").ok().or_else(|| std::env::var("EDITOR").ok()).filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalize_path_rejects_nonexistent() {
        let result = canonicalize_path("/this/path/does/not/exist/at/all");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid path"));
    }

    #[test]
    fn canonicalize_path_resolves_existing_path() {
        let result = canonicalize_path("/tmp");
        assert!(result.is_ok());
        let canonical = result.unwrap();
        assert!(canonical.is_absolute());
    }

    #[test]
    fn validate_path_in_indexed_dirs_allows_path_within_indexed_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.txt");
        std::fs::write(&file_path, "hello").unwrap();

        let config = crate::config::FlintConfig {
            search: crate::config::SearchConfig {
                directories: vec![tmp.path().to_string_lossy().to_string()],
                ..Default::default()
            },
            ..Default::default()
        };

        let canonical = std::fs::canonicalize(&file_path).unwrap();
        let result = validate_path_in_indexed_dirs(&canonical, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_path_in_indexed_dirs_rejects_path_outside_indexed_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let file_path = outside.path().join("secret.txt");
        std::fs::write(&file_path, "secret").unwrap();

        let config = crate::config::FlintConfig {
            search: crate::config::SearchConfig {
                directories: vec![tmp.path().to_string_lossy().to_string()],
                ..Default::default()
            },
            ..Default::default()
        };

        let canonical = std::fs::canonicalize(&file_path).unwrap();
        let result = validate_path_in_indexed_dirs(&canonical, &config);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("outside indexed directories"));
    }

    #[test]
    fn resolve_editor_returns_config_value_when_not_auto() {
        assert_eq!(resolve_editor("code"), Some("code".to_string()));
        assert_eq!(resolve_editor("nvim"), Some("nvim".to_string()));
    }

    #[test]
    fn resolve_editor_returns_none_when_auto_and_no_env() {
        std::env::remove_var("VISUAL");
        std::env::remove_var("EDITOR");
        assert_eq!(resolve_editor("auto"), None);
    }
}
