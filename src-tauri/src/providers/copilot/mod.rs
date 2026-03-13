//! GitHub Copilot LLM provider.
//!
//! Authenticates via the OAuth Device Flow and streams chat completions
//! from the Copilot API using server-sent events.

pub mod auth;
pub mod token;

use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::{ChatMessage, ToolCall};
use auth::DeviceCodeResponse;
use token::TokenManager;

use crate::kits::{ChatToolDef, KitRegistryState};

const USER_AGENT: &str = "Flint/0.1.0";

/// Maximum number of tool-call rounds before forcing a text response.
const MAX_TOOL_ROUNDS: usize = 5;

/// Maximum tool calls to execute in a single round.
const MAX_CALLS_PER_ROUND: usize = 10;

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
    /// Supports the tool-call loop: if the model responds with tool calls,
    /// they are dispatched to the kit registry, results are appended as
    /// messages, and the conversation continues until the model produces
    /// text content.
    ///
    /// Emits Tauri events as tokens arrive:
    /// - `chat:token`      — a content delta (partial text).
    /// - `chat:tool-start` — a tool invocation has started.
    /// - `chat:tool-done`  — a tool invocation has finished.
    /// - `chat:done`       — the stream has finished.
    /// - `chat:error`      — an error occurred during streaming.
    pub async fn send_message(
        &self,
        messages: &[ChatMessage],
        app: &AppHandle,
        registry: &KitRegistryState,
    ) -> Result<(), String> {
        let (token, endpoint) =
            self.token_manager.get_valid_token().await.map_err(|e| e.to_string())?;

        // Collect tool definitions from enabled kits.
        let tools = {
            let reg = registry.0.read().await;
            build_tools_array(reg.all_chat_tools())
        };

        let mut conversation: Vec<ChatMessage> = messages.to_vec();

        for round in 0..MAX_TOOL_ROUNDS {
            let body = build_request_body(&conversation, &tools);

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

            let stream_result = stream_sse_response(response, app).await;

            match stream_result {
                StreamResult::TextOnly => {
                    // Model responded with text — we're done.
                    break;
                }
                StreamResult::ToolCalls(tool_calls) => {
                    if tool_calls.is_empty() {
                        break;
                    }

                    // Append the assistant's tool-call message to the conversation.
                    conversation.push(ChatMessage::assistant_tool_calls(tool_calls.clone()));

                    // Dispatch each tool call to the registry.
                    let reg = registry.0.read().await;
                    let calls_to_run = tool_calls.into_iter().take(MAX_CALLS_PER_ROUND);

                    for call in calls_to_run {
                        let tool_info = ToolInfo {
                            kit_id: find_kit_for_tool(&reg, &call.function.name),
                            tool_name: call.function.name.clone(),
                        };
                        let _ = app.emit_to("main", "chat:tool-start", &tool_info);

                        let args: serde_json::Value =
                            serde_json::from_str(&call.function.arguments).unwrap_or_default();

                        let result = if let Some(ref kit_id) = tool_info.kit_id {
                            match tokio::time::timeout(
                                std::time::Duration::from_secs(10),
                                reg.invoke_chat_tool(kit_id, &call.function.name, args),
                            )
                            .await
                            {
                                Ok(Ok(val)) => serde_json::to_string(&val).unwrap_or_default(),
                                Ok(Err(e)) => serde_json::to_string(
                                    &serde_json::json!({ "error": e.to_string() }),
                                )
                                .unwrap_or_default(),
                                Err(_) => r#"{"error":"tool call timed out"}"#.to_string(),
                            }
                        } else {
                            r#"{"error":"no kit found for this tool"}"#.to_string()
                        };

                        conversation.push(ChatMessage::tool_result(&call.id, result));
                        let _ = app.emit_to("main", "chat:tool-done", &tool_info);
                    }

                    tracing::info!(round, "tool call round complete, continuing");
                }
            }
        }

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

/// Info about a tool call, emitted to the frontend for UX indicators.
#[derive(Debug, Clone, Serialize)]
struct ToolInfo {
    kit_id: Option<String>,
    tool_name: String,
}

/// Outcome of streaming a single SSE response.
enum StreamResult {
    /// The model produced text content (already emitted via events).
    TextOnly,
    /// The model requested tool calls.
    ToolCalls(Vec<ToolCall>),
}

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

/// Build the JSON request body for a chat completion, optionally with tools.
fn build_request_body(messages: &[ChatMessage], tools: &serde_json::Value) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": "gpt-4.1",
        "messages": messages,
        "stream": true,
        "n": 1,
    });

    // Only include tools array if non-empty.
    if let Some(arr) = tools.as_array() {
        if !arr.is_empty() {
            body["tools"] = tools.clone();
        }
    }

    body
}

/// Convert kit chat tool definitions into the OpenAI-compatible tools array format.
fn build_tools_array(kit_tools: &[(String, ChatToolDef)]) -> serde_json::Value {
    let tools: Vec<serde_json::Value> = kit_tools
        .iter()
        .map(|(_, def)| {
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": def.name,
                    "description": def.description,
                    "parameters": def.parameters,
                }
            })
        })
        .collect();
    serde_json::Value::Array(tools)
}

/// Find which kit owns a given tool name.
fn find_kit_for_tool(registry: &crate::kits::KitRegistry, tool_name: &str) -> Option<String> {
    registry
        .all_chat_tools()
        .iter()
        .find(|(_, def)| def.name == tool_name)
        .map(|(kit_id, _)| kit_id.clone())
}

/// Read an SSE byte stream, emit content deltas, and accumulate tool calls.
///
/// Returns whether the response was text-only or contained tool calls.
async fn stream_sse_response(response: reqwest::Response, app: &AppHandle) -> StreamResult {
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut token_count: usize = 0;
    let mut tool_acc = ToolCallAccumulator::new();
    let mut has_tool_calls = false;

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
                        SseEvent::ToolCallDelta { index, id, name, arguments } => {
                            has_tool_calls = true;
                            tool_acc.push(index, id, name, arguments);
                        }
                        SseEvent::Finished(reason) => {
                            tracing::debug!(reason = reason.as_str(), "finish_reason");
                        }
                        SseEvent::Done => {}
                    }
                }
            }
            Err(e) => {
                let _ = app.emit_to("main", "chat:error", e.to_string());
                break;
            }
        }
    }

    tracing::info!(token_count, has_tool_calls, "SSE stream finished");

    if has_tool_calls {
        StreamResult::ToolCalls(tool_acc.take())
    } else {
        StreamResult::TextOnly
    }
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
    use crate::kits::ChatToolDef;

    #[test]
    fn build_tools_array_creates_openai_format() {
        let kit_tools = vec![(
            "calculator".to_string(),
            ChatToolDef {
                name: "calculate".to_string(),
                description: "Evaluate math".to_string(),
                parameters: serde_json::json!({"type": "object"}),
            },
        )];

        let result = build_tools_array(&kit_tools);
        let arr = result.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["type"], "function");
        assert_eq!(arr[0]["function"]["name"], "calculate");
        assert_eq!(arr[0]["function"]["description"], "Evaluate math");
    }

    #[test]
    fn build_tools_array_empty_returns_empty_array() {
        let result = build_tools_array(&[]);
        assert_eq!(result.as_array().unwrap().len(), 0);
    }

    #[test]
    fn build_request_body_includes_tools_when_present() {
        let messages = vec![super::super::ChatMessage::text(super::super::ChatRole::User, "hello")];
        let tools = serde_json::json!([{"type": "function", "function": {"name": "test"}}]);

        let body = build_request_body(&messages, &tools);
        assert!(body["tools"].is_array());
        assert_eq!(body["tools"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn build_request_body_omits_tools_when_empty() {
        let messages = vec![super::super::ChatMessage::text(super::super::ChatRole::User, "hello")];
        let tools = serde_json::json!([]);

        let body = build_request_body(&messages, &tools);
        assert!(body.get("tools").is_none());
    }

    #[test]
    fn accumulator_filters_empty_id_calls() {
        let mut acc = ToolCallAccumulator::new();
        // Push a delta without an id
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
        // Index 1 has empty id, should be filtered
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].id, "c1");
        assert_eq!(calls[1].id, "c3");
    }
}
