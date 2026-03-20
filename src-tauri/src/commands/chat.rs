//! Tauri IPC commands for `OpenCode` chat.

use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::config::AppConfig;
use crate::opencode_project_config;
use crate::providers::opencode::OpenCodeProviderState;

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

/// Available model info for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    pub provider_name: String,
}

/// Project `OpenCode` model config status.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectModelConfigStatus {
    /// Whether a project-level `OpenCode` config file exists in the second brain repo.
    pub exists: bool,
    /// Whether that config declares a `model` value.
    pub has_model: bool,
    /// Current declared model value (`provider/model`) if present.
    pub model: Option<String>,
    /// Path to the config file used (or preferred path if missing).
    pub path: String,
}

/// A chat message from session history (for frontend hydration).
#[derive(Debug, Clone, serde::Serialize)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
}

/// Get the current chat connection status.
///
/// Uses the persisted config for `repo_path` (not the provider's runtime
/// path) so the frontend can distinguish "not configured" from "configured
/// but failed to connect."
#[tauri::command]
pub async fn get_chat_status(
    provider: State<'_, OpenCodeProviderState>,
    config: State<'_, AppConfig>,
) -> Result<ChatStatus, String> {
    let p = provider.0.read().await;
    Ok(ChatStatus {
        connected: p.is_connected(),
        session_id: p.session_id().map(String::from),
        repo_path: config.get().second_brain.repo_path,
    })
}

/// Send a chat message to the `OpenCode` backend.
///
/// The response streams via SSE events (`chat:token`, `chat:done`, `chat:error`).
/// Contract: send only the latest user message (delta-only), never full local history.
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

/// Get whether the second-brain project `OpenCode` config declares a default model.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn get_project_model_config_status(
    config: State<'_, AppConfig>,
) -> Result<ProjectModelConfigStatus, String> {
    let cfg = config.get();
    let repo = cfg
        .second_brain
        .repo_path
        .ok_or_else(|| "second brain repo path not configured".to_string())?;

    let project_cfg =
        opencode_project_config::get_project_model_config(std::path::Path::new(&repo))
            .map_err(|e| e.to_string())?;

    Ok(ProjectModelConfigStatus {
        exists: project_cfg.exists,
        has_model: project_cfg.has_model,
        model: project_cfg.model,
        path: project_cfg.path.display().to_string(),
    })
}

/// Persist a new project default model into second-brain `OpenCode` config.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn set_project_default_model(
    config: State<'_, AppConfig>,
    model: String,
) -> Result<(), String> {
    let cfg = config.get();
    let repo = cfg
        .second_brain
        .repo_path
        .ok_or_else(|| "second brain repo path not configured".to_string())?;

    opencode_project_config::set_project_default_model(std::path::Path::new(&repo), &model)
        .map_err(|e| e.to_string())
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

/// Get message history for the current `OpenCode` session.
#[tauri::command]
pub async fn get_session_messages(
    provider: State<'_, OpenCodeProviderState>,
) -> Result<Vec<HistoryMessage>, String> {
    let mut attempts = 0_u8;

    loop {
        let result = {
            let provider_guard = provider.0.read().await;
            provider_guard.get_session_messages().await
        };

        match result {
            Ok(messages) => {
                return Ok(messages
                    .into_iter()
                    .map(|m| HistoryMessage { role: m.role, content: m.content })
                    .collect());
            }
            Err(crate::providers::opencode::OpenCodeError::ServerNotRunning) if attempts == 0 => {
                attempts += 1;
                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Initialize or reinitialize the `OpenCode` provider.
///
/// Requires a configured second brain repo path. Returns an error if
/// no repo is configured — the frontend should direct the user to Settings.
#[tauri::command]
pub async fn init_opencode(
    app: AppHandle,
    provider: State<'_, OpenCodeProviderState>,
    config: State<'_, AppConfig>,
) -> Result<(), String> {
    let path =
        config.get().second_brain.repo_path.map(PathBuf::from).ok_or_else(|| {
            "second brain repo path not configured — set it in Settings".to_string()
        })?;

    let mut p = provider.0.write().await;
    p.shutdown().await;
    p.init(&path, &app).await.map_err(|e| e.to_string())
}
