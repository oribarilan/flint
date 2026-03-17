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
}

/// A message part (text content).
#[derive(Debug, Serialize)]
struct MessagePart {
    r#type: String,
    text: String,
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

    /// Send a text message to a session.
    ///
    /// The response streams via SSE events (handled by the event bridge),
    /// not through this HTTP response.
    pub async fn send_message(&self, session_id: &str, content: &str) -> Result<(), ClientError> {
        let body = SendMessageRequest {
            parts: vec![MessagePart { r#type: "text".to_owned(), text: content.to_owned() }],
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
