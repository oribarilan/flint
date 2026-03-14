//! GitHub Copilot LLM provider.
//!
//! Authenticates via the OAuth Device Flow and streams chat completions
//! from the Copilot API using server-sent events.

pub mod auth;
pub mod credential_store;
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
    /// Sends the conversation and streams content tokens back via Tauri events.
    /// Tool calling is not currently supported — the chat pipeline is text-only.
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

        let body = build_request_body(messages);

        let response = self
            .client
            .post(format!("{endpoint}/chat/completions"))
            .headers(build_headers(&token).map_err(|e| e.to_string())?)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let err = format!("HTTP {status}: {text}");
            let _ = app.emit_to("main", "chat:error", &err);
            return Err(err);
        }

        stream_sse_response(response, app).await;

        let _ = app.emit_to("main", "chat:done", ());
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

/// Build the JSON request body for a chat completion (text-only, no tools).
fn build_request_body(messages: &[ChatMessage]) -> serde_json::Value {
    serde_json::json!({
        "model": "gpt-4.1",
        "messages": messages,
        "stream": true,
        "n": 1,
    })
}

/// Read an SSE byte stream and emit content deltas via Tauri events.
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

                let (events, remaining) = parse_sse_events(&buffer);
                buffer = remaining;

                for event in events {
                    match event {
                        SseEvent::ContentDelta(content) => {
                            tracing::debug!(token = content.as_str(), "emit");
                            let _ = app.emit_to("main", "chat:token", content.as_str());
                            token_count += 1;
                        }
                        SseEvent::Finished(reason) => {
                            tracing::debug!(reason = reason.as_str(), "finish_reason");
                        }
                        SseEvent::ToolCallDelta { .. } | SseEvent::Done => {}
                    }
                }
            }
            Err(e) => {
                let _ = app.emit_to("main", "chat:error", e.to_string());
                break;
            }
        }
    }

    tracing::info!(token_count, "SSE stream finished");
}

/// Parsed result from a single SSE event line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseEvent {
    /// A content text delta.
    ContentDelta(String),
    /// A tool call delta (index, optional id, optional function name, argument chunk).
    ToolCallDelta {
        index: usize,
        id: Option<String>,
        name: Option<String>,
        arguments: Option<String>,
    },
    /// The stream finished with the given reason.
    Finished(String),
    /// The [DONE] marker.
    Done,
}

/// Parse SSE buffer into structured events.
///
/// Returns `(events, remaining_buffer)`. This is the pure logic extracted
/// for testability — no `AppHandle` required.
pub fn parse_sse_events(buffer: &str) -> (Vec<SseEvent>, String) {
    let mut events = Vec::new();
    let mut remaining = buffer.to_owned();

    while let Some(pos) = remaining.find('\n') {
        let line = remaining[..pos].trim().to_owned();
        remaining = remaining[pos + 1..].to_owned();

        let Some(data) = line.strip_prefix("data: ") else { continue };
        if data == "[DONE]" {
            events.push(SseEvent::Done);
            continue;
        }

        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else { continue };
        let Some(choices) = parsed["choices"].as_array() else { continue };

        for choice in choices {
            // Check finish_reason
            if let Some(reason) = choice["finish_reason"].as_str() {
                events.push(SseEvent::Finished(reason.to_string()));
            }

            let delta = &choice["delta"];

            // Content deltas
            if let Some(content) = delta["content"].as_str() {
                events.push(SseEvent::ContentDelta(content.to_string()));
            }

            // Tool call deltas
            if let Some(tool_calls) = delta["tool_calls"].as_array() {
                for tc in tool_calls {
                    let index = usize::try_from(tc["index"].as_u64().unwrap_or(0)).unwrap_or(0);
                    let id = tc["id"].as_str().map(String::from);
                    let name = tc["function"]["name"].as_str().map(String::from);
                    let arguments = tc["function"]["arguments"].as_str().map(String::from);
                    events.push(SseEvent::ToolCallDelta { index, id, name, arguments });
                }
            }
        }
    }

    (events, remaining)
}

/// Accumulates streamed tool call deltas into complete tool calls.
#[derive(Debug, Default)]
pub struct ToolCallAccumulator {
    calls: Vec<AccumulatedToolCall>,
}

/// A tool call being built up from streaming deltas.
#[derive(Debug, Clone)]
struct AccumulatedToolCall {
    id: String,
    name: String,
    arguments: String,
}

impl ToolCallAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Process a tool call delta, accumulating into the indexed slot.
    pub fn push(
        &mut self,
        index: usize,
        id: Option<String>,
        name: Option<String>,
        arguments: Option<String>,
    ) {
        // Grow the vec if needed
        while self.calls.len() <= index {
            self.calls.push(AccumulatedToolCall {
                id: String::new(),
                name: String::new(),
                arguments: String::new(),
            });
        }

        let slot = &mut self.calls[index];
        if let Some(id) = id {
            slot.id = id;
        }
        if let Some(name) = name {
            slot.name = name;
        }
        if let Some(args) = arguments {
            slot.arguments.push_str(&args);
        }
    }

    /// Drain accumulated calls into a vec of [`ToolCall`].
    pub fn take(&mut self) -> Vec<super::ToolCall> {
        self.calls
            .drain(..)
            .filter(|c| !c.id.is_empty())
            .map(|c| super::ToolCall {
                id: c.id,
                call_type: "function".to_string(),
                function: super::FunctionCall { name: c.name, arguments: c.arguments },
            })
            .collect()
    }

    pub const fn is_empty(&self) -> bool {
        self.calls.is_empty()
    }
}

// Keep backward compat for existing integration tests
/// Parse SSE buffer and extract content deltas (backward-compatible wrapper).
///
/// Returns `(tokens, remaining_buffer)`.
pub fn extract_sse_tokens(buffer: &str) -> (Vec<String>, String) {
    let (events, remaining) = parse_sse_events(buffer);
    let tokens = events
        .into_iter()
        .filter_map(|e| match e {
            SseEvent::ContentDelta(s) => Some(s),
            _ => None,
        })
        .collect();
    (tokens, remaining)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_request_body_has_required_fields() {
        let messages = vec![super::super::ChatMessage::text(super::super::ChatRole::User, "hello")];

        let body = build_request_body(&messages);
        assert!(body["messages"].is_array());
        assert_eq!(body["stream"], true);
        assert_eq!(body["model"], "gpt-4.1");
        // No tools field in text-only mode
        assert!(body.get("tools").is_none());
    }

    #[test]
    fn accumulator_filters_empty_id_calls() {
        let mut acc = ToolCallAccumulator::new();
        acc.push(0, None, Some("test".to_string()), Some("{}".to_string()));

        let calls = acc.take();
        assert!(calls.is_empty(), "calls with empty id should be filtered out");
    }

    #[test]
    fn accumulator_accumulates_arguments_across_pushes() {
        let mut acc = ToolCallAccumulator::new();
        acc.push(0, Some("call_1".to_string()), Some("calc".to_string()), Some("{\"a".to_string()));
        acc.push(0, None, None, Some("\":1}".to_string()));

        let calls = acc.take();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].function.arguments, r#"{"a":1}"#);
    }

    #[test]
    fn accumulator_handles_multiple_indexes() {
        let mut acc = ToolCallAccumulator::new();
        acc.push(0, Some("c1".to_string()), Some("f1".to_string()), Some("{}".to_string()));
        acc.push(2, Some("c3".to_string()), Some("f3".to_string()), Some("{}".to_string()));

        let calls = acc.take();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].id, "c1");
        assert_eq!(calls[1].id, "c3");
    }
}
