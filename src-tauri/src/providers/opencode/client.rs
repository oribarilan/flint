//! HTTP client for the `OpenCode` server API.
//!
//! Thin wrapper around `reqwest` for session management and messaging.
//! See: <https://opencode.ai/docs/sdk/> and <https://opencode.ai/docs/server/>

use std::time::Duration;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors from the `OpenCode` HTTP client.
#[derive(Debug, thiserror::Error)]
pub enum ClientError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("server returned error {status}: {body}")]
    Server { status: u16, body: String },

    #[error("server health check timed out after {0:?}")]
    HealthTimeout(Duration),

    #[error("failed to parse response: {0}")]
    Parse(String),
}

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

/// Health check response from `/global/health`.
#[derive(Debug, Deserialize)]
pub struct HealthResponse {
    pub healthy: bool,
}

/// Session info returned by the `OpenCode` API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    #[serde(default)]
    pub title: String,
}

/// Request body for creating a session.
#[derive(Debug, Serialize)]
struct CreateSessionRequest {
    title: String,
}

/// Request body for sending a message.
#[derive(Debug, Serialize)]
struct SendMessageRequest {
    parts: Vec<MessagePart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<ModelRef>,
}

/// A message part (text content).
#[derive(Debug, Serialize)]
struct MessagePart {
    r#type: String,
    text: String,
}

/// A model reference for prompts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRef {
    #[serde(rename = "providerID")]
    pub provider_id: String,
    #[serde(rename = "modelID")]
    pub model_id: String,
}

/// A model available from a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    pub provider_name: String,
}

/// Provider info from `/config/providers`.
#[derive(Debug, Clone, Deserialize)]
struct ProvidersResponse {
    providers: Vec<ProviderEntry>,
    default: std::collections::HashMap<String, String>,
}

/// A single provider with its models.
#[derive(Debug, Clone, Deserialize)]
struct ProviderEntry {
    id: String,
    name: String,
    models: Vec<ProviderModel>,
}

/// A model within a provider.
#[derive(Debug, Clone, Deserialize)]
struct ProviderModel {
    id: String,
    name: String,
}

/// Provider auth info exposed to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderAuthInfo {
    pub id: String,
    pub name: String,
    pub connected: bool,
}

/// Response from the OAuth authorize endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizeResponse {
    /// URL to open in the browser.
    pub url: String,
    /// Auth method: `"auto"` (device flow, server polls) or `"code"` (user pastes code back).
    pub method: String,
    /// Instructions to display (e.g. "Enter code: XXXX-YYYY").
    pub instructions: String,
}

/// Curated list of providers that support OAuth through the `OpenCode` server.
///
/// Only providers with working OAuth are listed — API-key-only providers
/// (groq, deepseek, etc.) must be configured via `opencode providers login`.
const KNOWN_PROVIDERS: &[(&str, &str)] = &[
    ("github-copilot", "GitHub Copilot"),
    ("anthropic", "Anthropic"),
    ("openai", "OpenAI"),
];

/// Map provider IDs to human-readable display names.
fn provider_display_name(id: &str) -> String {
    if let Some(&(_, name)) = KNOWN_PROVIDERS.iter().find(|&&(kid, _)| kid == id) {
        return name.to_owned();
    }
    // Fallback: title-case the ID.
    id.split('-')
        .map(|w| {
            let mut c = w.chars();
            c.next().map_or_else(String::new, |f| f.to_uppercase().to_string() + c.as_str())
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// HTTP client for the `OpenCode` server.
#[derive(Clone)]
pub struct OpenCodeClient {
    http: reqwest::Client,
    base_url: String,
}

impl OpenCodeClient {
    /// Create a client targeting a local `OpenCode` server.
    pub fn new(port: u16) -> Self {
        Self { http: reqwest::Client::new(), base_url: format!("http://127.0.0.1:{port}") }
    }

    /// Base URL for the server (e.g. `http://127.0.0.1:14096`).
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Poll the health endpoint until the server is ready.
    pub async fn wait_for_health(&self, timeout: Duration) -> Result<(), ClientError> {
        let start = std::time::Instant::now();
        let poll_interval = Duration::from_millis(500);

        loop {
            if start.elapsed() > timeout {
                return Err(ClientError::HealthTimeout(timeout));
            }

            match self.health().await {
                Ok(true) => {
                    tracing::info!("OpenCode server is healthy");
                    return Ok(());
                }
                Ok(false) => {
                    tracing::debug!("server responded but not healthy yet");
                }
                Err(e) => {
                    tracing::debug!(error = %e, "health check failed, retrying...");
                }
            }

            tokio::time::sleep(poll_interval).await;
        }
    }

    /// Check server health.
    async fn health(&self) -> Result<bool, ClientError> {
        let resp = self
            .http
            .get(format!("{}/global/health", self.base_url))
            .timeout(Duration::from_secs(5))
            .send()
            .await?;

        if !resp.status().is_success() {
            return Ok(false);
        }

        let body: HealthResponse = resp.json().await?;
        Ok(body.healthy)
    }

    /// Create a new chat session.
    pub async fn create_session(&self, title: &str) -> Result<Session, ClientError> {
        let resp = self
            .http
            .post(format!("{}/session", self.base_url))
            .json(&CreateSessionRequest { title: title.to_owned() })
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        resp.json::<Session>().await.map_err(|e| ClientError::Parse(e.to_string()))
    }

    /// Send a text message to a session, optionally with a specific model.
    ///
    /// The response streams via SSE events (handled by the event bridge),
    /// not through this HTTP response.
    pub async fn send_message(
        &self,
        session_id: &str,
        content: &str,
        model: Option<&ModelRef>,
    ) -> Result<(), ClientError> {
        let body = SendMessageRequest {
            parts: vec![MessagePart { r#type: "text".to_owned(), text: content.to_owned() }],
            model: model.cloned(),
        };

        let resp = self
            .http
            .post(format!("{}/session/{session_id}/message", self.base_url))
            .json(&body)
            .timeout(Duration::from_secs(300))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        Ok(())
    }

    /// Get available models from all connected providers.
    pub async fn get_models(&self) -> Result<(Vec<ModelInfo>, Option<String>), ClientError> {
        let data = self.get_providers_response().await?;

        let mut models = Vec::new();
        for provider in &data.providers {
            for model in &provider.models {
                models.push(ModelInfo {
                    id: format!("{}/{}", provider.id, model.id),
                    name: model.name.clone(),
                    provider_id: provider.id.clone(),
                    provider_name: provider.name.clone(),
                });
            }
        }

        // Find the default model (first entry in defaults map)
        let default_model = data.default.values().next().cloned();

        Ok((models, default_model))
    }

    /// Get the IDs of providers that the server considers connected (have credentials).
    pub async fn get_connected_provider_ids(&self) -> Result<Vec<String>, ClientError> {
        let data = self.get_providers_response().await?;
        Ok(data.providers.into_iter().map(|p| p.id).collect())
    }

    /// Fetch the `/config/providers` response from the server.
    async fn get_providers_response(&self) -> Result<ProvidersResponse, ClientError> {
        let resp = self.http.get(format!("{}/config/providers", self.base_url)).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        resp.json().await.map_err(|e| ClientError::Parse(e.to_string()))
    }

    /// Abort the active response in a session.
    pub async fn abort_session(&self, session_id: &str) -> Result<(), ClientError> {
        let resp =
            self.http.post(format!("{}/session/{session_id}/abort", self.base_url)).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        Ok(())
    }

    /// Get the SSE event stream URL.
    pub fn event_stream_url(&self) -> String {
        format!("{}/global/event", self.base_url)
    }

    /// Get a raw reqwest client for SSE streaming.
    pub const fn http_client(&self) -> &reqwest::Client {
        &self.http
    }

    /// Start OAuth authorization for a provider.
    ///
    /// Returns the authorize URL, flow method, and user-facing instructions.
    pub async fn authorize_provider(
        &self,
        provider_id: &str,
    ) -> Result<AuthorizeResponse, ClientError> {
        let resp = self
            .http
            .post(format!("{}/provider/{provider_id}/oauth/authorize", self.base_url))
            .json(&serde_json::json!({ "method": 0 }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        resp.json::<AuthorizeResponse>().await.map_err(|e| ClientError::Parse(e.to_string()))
    }

    /// Complete an OAuth authorization-code flow by submitting the user's code.
    pub async fn complete_provider_auth(
        &self,
        provider_id: &str,
        code: &str,
    ) -> Result<(), ClientError> {
        let resp = self
            .http
            .post(format!("{}/provider/{provider_id}/oauth/callback", self.base_url))
            .json(&serde_json::json!({ "method": 0, "code": code }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Standalone provider auth (no server required)
// ---------------------------------------------------------------------------

/// Read provider auth status from `OpenCode`'s credential store.
///
/// Returns all [`KNOWN_PROVIDERS`] merged with `~/.local/share/opencode/auth.json`.
/// Connected providers that aren't in the known list are included too.
pub fn read_provider_auth() -> Vec<ProviderAuthInfo> {
    let auth_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from(".local/share"))
        .join("opencode")
        .join("auth.json");

    let contents = std::fs::read_to_string(&auth_path).unwrap_or_else(|_| "{}".to_owned());
    let credentials: std::collections::HashMap<String, serde_json::Value> =
        serde_json::from_str(&contents).unwrap_or_default();

    let mut providers: Vec<ProviderAuthInfo> = KNOWN_PROVIDERS
        .iter()
        .map(|&(id, name)| ProviderAuthInfo {
            id: id.to_owned(),
            name: name.to_owned(),
            connected: credentials.contains_key(id),
        })
        .collect();

    // Include any connected providers not in the curated list.
    for id in credentials.keys() {
        if !KNOWN_PROVIDERS.iter().any(|&(kid, _)| kid == id) {
            providers.push(ProviderAuthInfo {
                id: id.clone(),
                name: provider_display_name(id),
                connected: true,
            });
        }
    }

    providers
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_constructs_correct_base_url() {
        let client = OpenCodeClient::new(14096);
        assert_eq!(client.base_url(), "http://127.0.0.1:14096");
    }

    #[test]
    fn event_stream_url_is_correct() {
        let client = OpenCodeClient::new(14096);
        assert_eq!(client.event_stream_url(), "http://127.0.0.1:14096/global/event");
    }

    #[test]
    fn client_error_display() {
        let err = ClientError::HealthTimeout(Duration::from_secs(30));
        assert!(err.to_string().contains("30s"));

        let err = ClientError::Server { status: 500, body: "internal error".into() };
        assert!(err.to_string().contains("500"));
    }
}
