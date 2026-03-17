//! `OpenCode` provider — manages a local `OpenCode` server for second-brain chat.
//!
//! Spawns an `opencode serve` process pointed at the user's second brain repo,
//! communicates via HTTP API + SSE event stream, and bridges responses to the
//! frontend via Tauri events.

pub mod client;
pub mod events;
pub mod process;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::AppHandle;
use tokio::sync::RwLock;

use client::OpenCodeClient;
use events::EventBridge;
use process::OpenCodeProcess;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors from the `OpenCode` provider layer.
#[derive(Debug, thiserror::Error)]
pub enum OpenCodeError {
    #[error("second brain repo path not configured")]
    RepoNotConfigured,

    #[error("second brain repo path does not exist: {0}")]
    RepoNotFound(PathBuf),

    #[error("opencode server failed to start: {0}")]
    ServerStart(String),

    #[error("opencode server not running")]
    ServerNotRunning,

    #[error("opencode API error: {0}")]
    Api(String),

    #[error("no active session")]
    NoSession,
}

// ---------------------------------------------------------------------------
// Provider state
// ---------------------------------------------------------------------------

/// Shared provider state behind a lock for Tauri managed state.
#[derive(Clone)]
pub struct OpenCodeProviderState(pub Arc<RwLock<OpenCodeProvider>>);

/// High-level orchestrator for the `OpenCode` backend.
///
/// Holds the child process, HTTP client, SSE bridge, and current session.
pub struct OpenCodeProvider {
    /// The managed opencode server process.
    process: Option<OpenCodeProcess>,
    /// HTTP client for the `OpenCode` API.
    client: Option<OpenCodeClient>,
    /// SSE event bridge (background task).
    event_bridge: Option<EventBridge>,
    /// Current active session ID.
    session_id: Option<String>,
    /// Port the server is listening on.
    port: u16,
    /// Configured repo path.
    repo_path: Option<PathBuf>,
}

impl OpenCodeProvider {
    /// Create a new uninitialized provider.
    pub const fn new() -> Self {
        Self {
            process: None,
            client: None,
            event_bridge: None,
            session_id: None,
            port: 14096,
            repo_path: None,
        }
    }

    /// Initialize the provider: start the server, wait for health, create a session.
    ///
    /// If the server is already running, this is a no-op.
    pub async fn init(&mut self, repo_path: &Path, app: &AppHandle) -> Result<(), OpenCodeError> {
        if self.process.is_some() {
            tracing::info!("OpenCode provider already initialized");
            return Ok(());
        }

        // Validate the repo path.
        if !repo_path.is_dir() {
            return Err(OpenCodeError::RepoNotFound(repo_path.to_path_buf()));
        }

        self.repo_path = Some(repo_path.to_path_buf());

        // Start the server process.
        let process = OpenCodeProcess::start(repo_path, self.port)
            .map_err(|e| OpenCodeError::ServerStart(e.to_string()))?;
        self.process = Some(process);

        // Create the HTTP client and wait for the server to be ready.
        let client = OpenCodeClient::new(self.port);
        client
            .wait_for_health(std::time::Duration::from_secs(30))
            .await
            .map_err(|e| OpenCodeError::ServerStart(e.to_string()))?;

        // Start the SSE event bridge.
        let bridge = EventBridge::start(&client, app.clone())
            .map_err(|e| OpenCodeError::Api(e.to_string()))?;
        self.event_bridge = Some(bridge);

        // Create a session.
        let session = client
            .create_session("Flint chat")
            .await
            .map_err(|e| OpenCodeError::Api(e.to_string()))?;
        self.session_id = Some(session.id.clone());
        self.client = Some(client);

        tracing::info!(
            session_id = %session.id,
            port = self.port,
            "OpenCode provider initialized"
        );
        Ok(())
    }

    /// Send a message to the current session.
    pub async fn send_message(&self, content: &str) -> Result<(), OpenCodeError> {
        let client = self.client.as_ref().ok_or(OpenCodeError::ServerNotRunning)?;
        let session_id = self.session_id.as_ref().ok_or(OpenCodeError::NoSession)?;

        client
            .send_message(session_id, content)
            .await
            .map_err(|e| OpenCodeError::Api(e.to_string()))?;
        Ok(())
    }

    /// Abort the current in-progress response.
    pub async fn abort(&self) -> Result<(), OpenCodeError> {
        let client = self.client.as_ref().ok_or(OpenCodeError::ServerNotRunning)?;
        let session_id = self.session_id.as_ref().ok_or(OpenCodeError::NoSession)?;

        client.abort_session(session_id).await.map_err(|e| OpenCodeError::Api(e.to_string()))?;
        Ok(())
    }

    /// Create a new session, replacing the current one.
    pub async fn new_session(&mut self) -> Result<(), OpenCodeError> {
        let client = self.client.as_ref().ok_or(OpenCodeError::ServerNotRunning)?;

        let session = client
            .create_session("Flint chat")
            .await
            .map_err(|e| OpenCodeError::Api(e.to_string()))?;
        self.session_id = Some(session.id.clone());

        tracing::info!(session_id = %session.id, "created new OpenCode session");
        Ok(())
    }

    /// Whether the provider is initialized and the server is running.
    pub const fn is_connected(&self) -> bool {
        self.process.is_some() && self.client.is_some()
    }

    /// Current session ID, if any.
    pub fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }

    /// Configured repo path, if any.
    pub fn repo_path(&self) -> Option<&Path> {
        self.repo_path.as_deref()
    }

    /// Shut down the provider: stop the event bridge and kill the server.
    pub async fn shutdown(&mut self) {
        if let Some(bridge) = self.event_bridge.take() {
            bridge.stop();
        }

        if let Some(mut process) = self.process.take() {
            if let Err(e) = process.stop().await {
                tracing::warn!(error = %e, "failed to stop opencode server");
            }
        }

        self.client = None;
        self.session_id = None;
        tracing::info!("OpenCode provider shut down");
    }
}

impl Default for OpenCodeProvider {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_provider_is_not_connected() {
        let provider = OpenCodeProvider::new();
        assert!(!provider.is_connected());
        assert!(provider.session_id().is_none());
        assert!(provider.repo_path().is_none());
    }
}
