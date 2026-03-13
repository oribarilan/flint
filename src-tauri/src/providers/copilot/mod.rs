//! GitHub Copilot LLM provider.
//!
//! Authenticates via the OAuth Device Flow and streams chat completions
//! from the Copilot API using server-sent events.

pub mod auth;
pub mod token;

use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue};
use tauri::{AppHandle, Emitter};

use super::ChatMessage;
use auth::DeviceCodeResponse;
use token::TokenManager;

const USER_AGENT: &str = "Flint/0.1.0";

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/// GitHub Copilot chat completions provider.
///
/// Manages authentication and streams chat responses via Tauri events.
#[derive(Debug)]
pub struct CopilotProvider {
    /// Shared HTTP client for all requests.
    client: reqwest::Client,
    /// Handles token storage, retrieval, and refresh.
    token_manager: TokenManager,
}

impl Default for CopilotProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CopilotProvider {
    /// Create a new provider with a shared HTTP client and token manager.
    pub fn new() -> Self {
        let client = reqwest::Client::new();
        let token_manager = TokenManager::new(client.clone());
        Self { client, token_manager }
    }

    /// Start the OAuth device-flow auth (step 1).
    ///
    /// Returns the device code, user code, and verification URL.
    pub async fn start_auth(&self) -> Result<DeviceCodeResponse, String> {
        auth::request_device_code(&self.client).await.map_err(|e| e.to_string())
    }

    /// Complete the OAuth device-flow auth (steps 2–3).
    ///
    /// Polls for the GitHub access token, then exchanges it for a
    /// Copilot API token. Both tokens are persisted in the keychain.
    pub async fn complete_auth(&self, device_code: &str, interval: u64) -> Result<(), String> {
        let github_token = auth::poll_for_access_token(&self.client, device_code, interval)
            .await
            .map_err(|e| e.to_string())?;

        self.token_manager.store_github_token(&github_token).await.map_err(|e| e.to_string())?;

        let copilot_token = auth::exchange_for_copilot_token(&self.client, &github_token)
            .await
            .map_err(|e| e.to_string())?;

        self.token_manager.store_copilot_token(copilot_token).await.map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Stream a chat completion from the Copilot API.
    ///
    /// Emits Tauri events as tokens arrive:
    /// - `chat:token` — a content delta (partial text).
    /// - `chat:done`  — the stream has finished.
    /// - `chat:error` — an error occurred during streaming.
    pub async fn send_message(
        &self,
        messages: &[ChatMessage],
        app: &AppHandle,
    ) -> Result<(), String> {
        let (token, endpoint) =
            self.token_manager.get_valid_token().await.map_err(|e| e.to_string())?;

        let response = self
            .client
            .post(format!("{endpoint}/chat/completions"))
            .headers(build_headers(&token).map_err(|e| e.to_string())?)
            .json(&build_request_body(messages))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let err = format!("HTTP {status}: {text}");
            let _ = app.emit("chat:error", &err);
            return Err(err);
        }

        stream_sse_response(response, app).await;
        Ok(())
    }

    /// Whether there are stored credentials.
    pub async fn is_authenticated(&self) -> bool {
        self.token_manager.is_authenticated().await
    }

    /// Clear all stored tokens.
    pub async fn sign_out(&self) {
        self.token_manager.sign_out().await;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build the required HTTP headers for the Copilot chat API.
fn build_headers(token: &str) -> Result<HeaderMap, reqwest::header::InvalidHeaderValue> {
    let mut headers = HeaderMap::new();
    headers.insert("Authorization", HeaderValue::from_str(&format!("Bearer {token}"))?);
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert("Accept", HeaderValue::from_static("text/event-stream"));
    headers.insert("Openai-Intent", HeaderValue::from_static("conversation-edits"));
    headers.insert("User-Agent", HeaderValue::from_static(USER_AGENT));
    headers.insert("editor-version", HeaderValue::from_static("vscode/1.85.1"));
    headers.insert("editor-plugin-version", HeaderValue::from_static("copilot/1.155.0"));
    Ok(headers)
}

/// Build the JSON request body for a chat completion.
fn build_request_body(messages: &[ChatMessage]) -> serde_json::Value {
    serde_json::json!({
        "model": "gpt-4.1",
        "messages": messages,
        "stream": true,
        "n": 1,
    })
}

/// Read an SSE byte stream and emit Tauri events for each content delta.
async fn stream_sse_response(response: reqwest::Response, app: &AppHandle) {
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut token_count: usize = 0;

    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                tracing::debug!(chunk_len = bytes.len(), "SSE chunk received");
                buffer.push_str(&text);
                token_count += process_sse_lines(&mut buffer, app);
            }
            Err(e) => {
                let _ = app.emit("chat:error", e.to_string());
                break;
            }
        }
    }

    tracing::info!(token_count, "SSE stream finished");
    let _ = app.emit("chat:done", ());
}

/// Extract and emit content deltas from complete SSE lines in the buffer.
///
/// Any incomplete trailing line is left in the buffer for the next chunk.
fn process_sse_lines(buffer: &mut String, app: &AppHandle) -> usize {
    let mut count = 0;
    while let Some(pos) = buffer.find('\n') {
        let line = buffer[..pos].trim().to_owned();
        buffer.replace_range(..=pos, "");

        let Some(data) = line.strip_prefix("data: ") else { continue };
        if data == "[DONE]" {
            continue;
        }

        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else { continue };

        if let Some(choices) = parsed["choices"].as_array() {
            for choice in choices {
                if let Some(delta) = choice["delta"]["content"].as_str() {
                    tracing::debug!(token = delta, choice_index = choice["index"].as_u64(), "emit");
                    let _ = app.emit("chat:token", delta);
                    count += 1;
                }
            }
        }
    }
    count
}
