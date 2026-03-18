//! Tauri IPC commands for window management, file search, file opening,
//! and `OpenCode` chat.

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::config::{AppConfig, FlintConfig};
use crate::indexer::AppIndex;
use crate::kits::{KitContextBase, KitInfo, KitRegistryState, KitSearchResult, KitState};
use crate::providers::opencode::OpenCodeProviderState;
use crate::search::SearchResult;
use crate::window;

// ---------------------------------------------------------------------------
// OpenCode chat commands
// ---------------------------------------------------------------------------

/// Chat connection status.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChatStatus {
    /// Whether the `OpenCode` server is running and connected.
    pub connected: bool,
    /// Current session ID, if any.
    pub session_id: Option<String>,
    /// Configured second brain repo path.
    pub repo_path: Option<String>,
}

/// Get the current chat connection status.
#[tauri::command]
pub async fn get_chat_status(
    provider: State<'_, OpenCodeProviderState>,
) -> Result<ChatStatus, String> {
    let p = provider.0.read().await;
    Ok(ChatStatus {
        connected: p.is_connected(),
        session_id: p.session_id().map(String::from),
        repo_path: p.repo_path().map(|p| p.to_string_lossy().to_string()),
    })
}

/// Send a chat message to the `OpenCode` backend.
///
/// The response streams via SSE events (`chat:token`, `chat:done`, `chat:error`).
#[tauri::command]
pub async fn send_chat_message(
    provider: State<'_, OpenCodeProviderState>,
    message: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<(), String> {
    let model_ref = match (provider_id, model_id) {
        (Some(pid), Some(mid)) => {
            Some(crate::providers::opencode::client::ModelRef { provider_id: pid, model_id: mid })
        }
        _ => None,
    };
    let p = provider.0.read().await;
    p.send_message(&message, model_ref.as_ref()).await.map_err(|e| e.to_string())
}

/// Available model info for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    pub provider_name: String,
}

/// Get available models from connected providers.
#[tauri::command]
pub async fn get_available_models(
    provider: State<'_, OpenCodeProviderState>,
) -> Result<(Vec<AvailableModel>, Option<String>), String> {
    let result = {
        let p = provider.0.read().await;
        p.get_models().await.map_err(|e| e.to_string())?
    };
    let (models, default) = result;
    let available: Vec<AvailableModel> = models
        .into_iter()
        .map(|m| AvailableModel {
            id: m.id,
            name: m.name,
            provider_id: m.provider_id,
            provider_name: m.provider_name,
        })
        .collect();
    Ok((available, default))
}

/// Abort the current in-progress chat response.
#[tauri::command]
pub async fn abort_chat(provider: State<'_, OpenCodeProviderState>) -> Result<(), String> {
    let p = provider.0.read().await;
    p.abort().await.map_err(|e| e.to_string())
}

/// Clear chat by creating a new `OpenCode` session.
#[tauri::command]
pub async fn clear_chat(provider: State<'_, OpenCodeProviderState>) -> Result<(), String> {
    let mut p = provider.0.write().await;
    p.new_session().await.map_err(|e| e.to_string())
}

/// Initialize or reinitialize the `OpenCode` provider.
///
/// Uses the configured second brain repo path, or falls back to a temp
/// directory so that provider auth and model listing work even before
/// a brain repo is selected.
#[tauri::command]
pub async fn init_opencode(
    app: AppHandle,
    provider: State<'_, OpenCodeProviderState>,
    config: State<'_, AppConfig>,
) -> Result<(), String> {
    let path = config
        .get()
        .second_brain
        .repo_path
        .map_or_else(|| std::env::temp_dir().join("flint-opencode"), PathBuf::from);

    // Ensure the directory exists (temp fallback may not).
    std::fs::create_dir_all(&path).map_err(|e| format!("failed to create dir: {e}"))?;

    let mut p = provider.0.write().await;
    p.shutdown().await;
    p.init(&path, &app).await.map_err(|e| e.to_string())
}

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

/// Open the settings window.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    window::open_settings(&app)
}

// ---------------------------------------------------------------------------
// Search commands
// ---------------------------------------------------------------------------

/// Search for files by name via the OS search backend (Spotlight on macOS).
#[tauri::command]
pub async fn search_files(
    query: String,
    config: State<'_, AppConfig>,
) -> Result<Vec<SearchResult>, String> {
    #[cfg(target_os = "macos")]
    {
        let dirs = config.get().search.directories;
        let entries = crate::indexer::spotlight::search_files(&query, &dirs)
            .await
            .map_err(|e| e.to_string())?;
        Ok(entries.iter().map(SearchResult::from_entry).collect())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&query, &config);
        Ok(Vec::new())
    }
}

/// Unified search: checks command prefixes first, falls back to core file search.
///
/// Returns results in the unified [`KitSearchResult`] format. Each result
/// includes a `kind` field (`File`, `Directory`, `Application`, or `Command`).
#[tauri::command]
pub async fn search_all(
    query: String,
    registry_state: State<'_, KitRegistryState>,
    ctx_base: State<'_, KitContextBase>,
    app_index: State<'_, AppIndex>,
    config: State<'_, AppConfig>,
) -> Result<Vec<KitSearchResult>, String> {
    const MAX_RESULTS: usize = 20;

    // Check command prefix triggers under a read lock.
    let search_result = {
        let registry = registry_state.0.read().await;
        registry.search_by_prefix(&query).map(|(kit_id, cmd_id, results)| {
            let needs_init = matches!(registry.kit_state(&kit_id), Some(KitState::Registered));
            let kit_name = registry.kit_name(&kit_id).unwrap_or_default().to_string();
            (kit_id, cmd_id, results, needs_init, kit_name)
        })
    };

    if let Some((kit_id, _cmd_id, results, needs_init, kit_name)) = search_result {
        // Spawn lazy init in background if kit was just registered.
        if needs_init {
            let registry_arc = Arc::clone(&registry_state.0);
            let ctx_base_owned: KitContextBase = (*ctx_base).clone();
            let id = kit_id.clone();
            tokio::spawn(async move {
                let mut reg = registry_arc.write().await;
                if let Err(e) = reg.ensure_init(&id, &ctx_base_owned).await {
                    tracing::warn!(kit = %id, error = %e, "kit init failed");
                }
            });
        }

        let kit_results: Vec<KitSearchResult> = results
            .into_iter()
            .take(MAX_RESULTS)
            .map(|r| KitSearchResult::from_kit_result(&kit_id, &kit_name, r))
            .collect();
        return Ok(kit_results);
    }

    // No prefix matched — fall through to app search + file search + kits.
    let registry = registry_state.0.read().await;
    let kit_discovery = registry.discovery_results(&query);
    drop(registry);

    // Score preloaded apps with nucleo (fuzzy, <1ms).
    let core_scored = crate::search::scored_search(&query, &app_index.0, MAX_RESULTS);

    // Merge scored apps and kit discovery results by score descending.
    let mut scored: Vec<(u32, KitSearchResult)> = core_scored
        .into_iter()
        .map(|(score, r)| (score, KitSearchResult::from_core_result(r, score)))
        .chain(kit_discovery)
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0));

    let mut results: Vec<KitSearchResult> =
        scored.into_iter().take(MAX_RESULTS).map(|(_, r)| r).collect();

    // For 3+ char queries, also search files via Spotlight (async, ~100ms).
    #[cfg(target_os = "macos")]
    if query.len() >= 3 && results.len() < MAX_RESULTS {
        let dirs = config.get().search.directories;
        match crate::indexer::spotlight::search_files(&query, &dirs).await {
            Ok(file_entries) => {
                let remaining = MAX_RESULTS - results.len();
                results.extend(file_entries.into_iter().take(remaining).map(|entry| {
                    let sr = SearchResult::from_entry(&entry);
                    KitSearchResult::from_core_result(sr, 0)
                }));
            }
            Err(e) => {
                tracing::warn!("Spotlight file search failed: {e}");
            }
        }
    }

    // Suppress unused variable warning on non-macOS.
    let _ = &config;

    Ok(results)
}

/// Search within an active command (chip is shown in the search bar).
#[tauri::command]
pub async fn search_command(
    kit_id: String,
    command_id: String,
    query: String,
    registry_state: State<'_, KitRegistryState>,
) -> Result<Vec<KitSearchResult>, String> {
    const MAX_RESULTS: usize = 20;

    let registry = registry_state.0.read().await;
    let kit_name = registry.kit_name(&kit_id).unwrap_or_default().to_string();
    let results =
        registry.search_command(&kit_id, &command_id, &query).map_err(|e| e.to_string())?;
    drop(registry);

    Ok(results
        .into_iter()
        .take(MAX_RESULTS)
        .map(|r| KitSearchResult::from_kit_result(&kit_id, &kit_name, r))
        .collect())
}

/// Execute an Execute-mode command.
#[tauri::command]
pub async fn execute_command(
    kit_id: String,
    command_id: String,
    registry_state: State<'_, KitRegistryState>,
) -> Result<crate::kits::CommandOutput, String> {
    let registry = registry_state.0.read().await;
    registry.execute_command(&kit_id, &command_id).await.map_err(|e| e.to_string())
}

/// Handle a custom action dispatched from the frontend Action Panel.
#[tauri::command]
pub async fn handle_custom_action(
    kit_id: String,
    action_id: String,
    registry_state: State<'_, KitRegistryState>,
) -> Result<Option<String>, String> {
    let registry = registry_state.0.read().await;
    registry.handle_custom_action(&kit_id, &action_id).await.map_err(|e| e.to_string())
}

/// Open a file or application at `path` with the system default handler.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri deserialises into owned String
pub fn open_file(path: String) -> Result<(), String> {
    let canonical = canonicalize_path(&path)?;
    open_with_system(&canonical.to_string_lossy()).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Action Panel commands
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Icon commands
// ---------------------------------------------------------------------------

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

// (OpenCode chat commands are defined above, near the top of the file.)

// ---------------------------------------------------------------------------
// Config commands
// ---------------------------------------------------------------------------

/// Get the current application config.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn get_config(config: State<'_, AppConfig>) -> FlintConfig {
    config.get()
}

/// Get the compile-time default config.
#[tauri::command]
pub fn get_default_config() -> FlintConfig {
    FlintConfig::default()
}

/// Update the application config and persist to disk.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn update_config(config: State<'_, AppConfig>, new_config: FlintConfig) -> Result<(), String> {
    config.update(new_config).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Kit commands
// ---------------------------------------------------------------------------

/// Get metadata for all registered kits.
#[tauri::command]
pub async fn get_kit_manifests(
    registry: State<'_, KitRegistryState>,
) -> Result<Vec<KitInfo>, String> {
    let reg = registry.0.read().await;
    Ok(reg.kit_infos())
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

/// Canonicalize a path received from the frontend.
///
/// Resolves symlinks and `..` components, ensuring the path is absolute and
/// the target actually exists on disk.
fn canonicalize_path(path: &str) -> Result<PathBuf, String> {
    std::fs::canonicalize(path).map_err(|e| format!("invalid path '{path}': {e}"))
}

/// Validate that a canonical path falls within one of the configured indexed
/// directories. Used for destructive operations (delete) to limit blast radius.
fn validate_path_in_indexed_dirs(
    canonical: &std::path::Path,
    config: &FlintConfig,
) -> Result<(), String> {
    let home = dirs::home_dir();
    let allowed: Vec<PathBuf> = config
        .search
        .directories
        .iter()
        .filter_map(|d| {
            let path = if let Some(rest) = d.strip_prefix("~/") {
                home.as_ref()?.join(rest)
            } else if d == "~" {
                home.clone()?
            } else {
                PathBuf::from(d)
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
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());
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
fn resolve_editor(config_value: &str) -> Option<String> {
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
