//! Tauri IPC commands for window management, file search, file opening,
//! and Copilot chat.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::config::{AppConfig, FlintConfig};
use crate::indexer::FileIndex;
use crate::kits::{KitContextBase, KitInfo, KitRegistryState, KitSearchResult, KitState};
use crate::providers;
use crate::providers::copilot::auth::DeviceCodeResponse;
use crate::providers::{AuthStatus, ChatMessage, ChatRole};
use crate::search::SearchResult;
use crate::window;

// ---------------------------------------------------------------------------
// Copilot state
// ---------------------------------------------------------------------------

/// Managed Tauri state wrapping the Copilot provider.
pub struct CopilotProviderState(pub providers::copilot::CopilotProvider);

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

/// Unified search: checks kit triggers first, falls back to core file search.
///
/// Returns results in the unified [`KitSearchResult`] format.
#[tauri::command]
pub async fn search_all(
    query: String,
    registry_state: State<'_, KitRegistryState>,
    ctx_base: State<'_, KitContextBase>,
    index: State<'_, FileIndex>,
) -> Result<Vec<KitSearchResult>, String> {
    const MAX_RESULTS: usize = 20;

    // Check kit triggers under a read lock.
    let search_result = {
        let registry = registry_state.0.read().await;
        registry.search(&query).map(|(kit_id, results)| {
            let needs_init = matches!(registry.kit_state(&kit_id), Some(KitState::Registered));
            (kit_id, results, needs_init)
        })
    };

    if let Some((kit_id, results, needs_init)) = search_result {
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
            .map(|r| KitSearchResult::from_kit_result(&kit_id, r))
            .collect();
        return Ok(kit_results);
    }

    // No kit matched — fall through to core file search + kit discovery.
    // Both are scored with nucleo fuzzy matching and merged by score descending.
    let registry = registry_state.0.read().await;
    let kit_discovery = registry.discovery_results(&query);
    drop(registry);

    let core_scored = {
        let entries = index.0.read().map_err(|e| e.to_string())?;
        crate::search::scored_search(&query, &entries, MAX_RESULTS)
    };

    // Merge core results and kit discovery results by score descending.
    let mut merged: Vec<(u32, KitSearchResult)> = core_scored
        .into_iter()
        .map(|(score, r)| (score, KitSearchResult::from_core_result(r, score)))
        .chain(kit_discovery)
        .collect();
    merged.sort_by(|a, b| b.0.cmp(&a.0));

    Ok(merged.into_iter().take(MAX_RESULTS).map(|(_, r)| r).collect())
}

/// Open a file or application at `path` with the system default handler.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri deserialises into owned String
pub fn open_file(path: String) -> Result<(), String> {
    open_with_system(&path).map_err(|e| e.to_string())?;
    Ok(())
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

// ---------------------------------------------------------------------------
// Copilot commands
// ---------------------------------------------------------------------------

/// Start the Copilot device-flow auth.
///
/// Returns the user code and verification URL for the caller to present.
#[tauri::command]
pub async fn start_copilot_auth(
    provider: State<'_, CopilotProviderState>,
) -> Result<DeviceCodeResponse, String> {
    provider.0.start_auth().await
}

/// Complete the auth flow by polling for the access token.
///
/// Blocks until the user authorises or the code expires.
#[tauri::command]
pub async fn complete_copilot_auth(
    provider: State<'_, CopilotProviderState>,
    device_code: String,
    interval: u64,
) -> Result<(), String> {
    provider.0.complete_auth(&device_code, interval).await
}

/// Check whether the user is authenticated with Copilot.
#[tauri::command]
pub async fn get_auth_status(
    provider: State<'_, CopilotProviderState>,
) -> Result<AuthStatus, String> {
    Ok(AuthStatus { authenticated: provider.0.is_authenticated().await, username: None })
}

/// Send chat messages and stream the response via Tauri events.
///
/// Emits `chat:token`, `chat:tool-start`, `chat:tool-done`, `chat:done`,
/// and `chat:error` events.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri injects AppHandle by value
pub async fn send_chat_message(
    app: AppHandle,
    provider: State<'_, CopilotProviderState>,
    registry: State<'_, KitRegistryState>,
    message: String,
) -> Result<(), String> {
    let messages = vec![ChatMessage::text(ChatRole::User, message)];
    provider.0.send_message(&messages, &app, &registry).await
}

/// Sign out and clear all stored Copilot tokens.
#[tauri::command]
pub async fn sign_out(provider: State<'_, CopilotProviderState>) -> Result<(), String> {
    provider.0.sign_out().await;
    Ok(())
}

// ---------------------------------------------------------------------------
// Config commands
// ---------------------------------------------------------------------------

/// Get the current application config.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn get_config(config: State<'_, AppConfig>) -> FlintConfig {
    config.get()
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
