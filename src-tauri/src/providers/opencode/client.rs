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

/// Session summary returned by `GET /session` (list).
#[derive(Debug, Clone, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub time: SessionTime,
}

/// Timestamps on a session.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct SessionTime {
    #[serde(default)]
    pub created: u64,
    #[serde(default)]
    pub updated: u64,
}

/// A message in a session, as returned by `GET /session/{id}/message`.
#[derive(Debug, Clone, Deserialize)]
pub struct SessionMessageRaw {
    pub info: MessageInfo,
    #[serde(default)]
    pub parts: Vec<MessagePartRaw>,
}

/// Metadata for a single message.
#[derive(Debug, Clone, Deserialize)]
pub struct MessageInfo {
    pub role: String,
}

/// A single part of a message.
#[derive(Debug, Clone, Deserialize)]
pub struct MessagePartRaw {
    #[serde(default, rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub text: String,
}

/// A simplified chat message for the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
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

/// A single provider with its models (keyed by model ID).
#[derive(Debug, Clone, Deserialize)]
struct ProviderEntry {
    id: String,
    name: String,
    models: std::collections::HashMap<String, ProviderModel>,
}

/// A model within a provider.
#[derive(Debug, Clone, Deserialize)]
struct ProviderModel {
    id: String,
    name: String,
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
            for model in provider.models.values() {
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

    /// List all sessions, sorted by most recently updated first.
    pub async fn list_sessions(&self) -> Result<Vec<SessionSummary>, ClientError> {
        let resp = self.http.get(format!("{}/session", self.base_url)).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        let mut sessions: Vec<SessionSummary> =
            resp.json().await.map_err(|e| ClientError::Parse(e.to_string()))?;

        // Most recently updated first.
        sessions.sort_by(|a, b| b.time.updated.cmp(&a.time.updated));
        Ok(sessions)
    }

    /// Get messages for a session, returning simplified role + content pairs.
    ///
    /// Extracts only text parts from each message; skips tool invocations,
    /// step-start/finish, and other non-text parts.
    pub async fn get_session_messages(
        &self,
        session_id: &str,
    ) -> Result<Vec<HistoryMessage>, ClientError> {
        let resp =
            self.http.get(format!("{}/session/{session_id}/message", self.base_url)).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(ClientError::Server { status, body });
        }

        let raw: Vec<SessionMessageRaw> =
            resp.json().await.map_err(|e| ClientError::Parse(e.to_string()))?;

        let messages = raw
            .into_iter()
            .filter_map(|msg| {
                let text: String = msg
                    .parts
                    .iter()
                    .filter(|p| p.kind == "text")
                    .map(|p| p.text.as_str())
                    .collect::<Vec<_>>()
                    .join("");

                if text.is_empty() {
                    return None;
                }

                let role = match msg.info.role.as_str() {
                    "user" => "user",
                    "assistant" => "assistant",
                    _ => return None,
                };

                Some(HistoryMessage { role: role.to_owned(), content: text })
            })
            .collect();

        Ok(messages)
    }

    /// Get a raw reqwest client for SSE streaming.
    pub const fn http_client(&self) -> &reqwest::Client {
        &self.http
    }
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
