//! SSE event bridge — subscribes to `OpenCode`'s `/global/event` stream and
//! re-emits relevant events as Tauri events for the frontend.
//!
//! Maps `OpenCode` events to the same `chat:token`, `chat:done`, `chat:error`
//! events the frontend already listens to.

use futures::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

use super::client::OpenCodeClient;

#[cfg(debug_assertions)]
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(debug_assertions)]
static CHAT_TOKEN_EMIT_COUNT: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
enum BridgeEvent {
    Token { delta: String, source: &'static str },
    Done,
    ToolStart(String),
    ToolEnd(String),
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum EventBridgeError {
    #[error("failed to connect to event stream: {0}")]
    Connect(String),
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

/// Background task that bridges `OpenCode` SSE events to Tauri events.
pub struct EventBridge {
    task: JoinHandle<()>,
}

impl EventBridge {
    /// Start the event bridge as a background task.
    pub fn start(client: &OpenCodeClient, app: AppHandle) -> Result<Self, EventBridgeError> {
        let url = client.event_stream_url();
        let http = client.http_client().clone();

        let task = tokio::spawn(async move {
            if let Err(e) = run_event_loop(&http, &url, &app).await {
                tracing::error!(error = %e, "SSE event loop exited with error");
                let _ = app.emit_to("main", "chat:error", &e.to_string());
            }
        });

        Ok(Self { task })
    }

    /// Stop the event bridge.
    pub fn stop(self) {
        self.task.abort();
    }
}

// ---------------------------------------------------------------------------
// SSE event loop
// ---------------------------------------------------------------------------

/// Connect to the SSE stream and process events indefinitely.
///
/// Reconnects automatically on connection drops.
async fn run_event_loop(
    http: &reqwest::Client,
    url: &str,
    app: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    loop {
        tracing::info!(url = url, "connecting to OpenCode event stream");

        match connect_and_process(http, url, app).await {
            Ok(()) => {
                tracing::info!("SSE stream ended cleanly, reconnecting...");
            }
            Err(e) => {
                tracing::warn!(error = %e, "SSE stream error, reconnecting in 2s...");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }
}

/// Single SSE connection: connect, read events, emit to frontend.
async fn connect_and_process(
    http: &reqwest::Client,
    url: &str,
    app: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let response = http.get(url).header("Accept", "text/event-stream").send().await?;

    if !response.status().is_success() {
        return Err(format!("SSE endpoint returned {}", response.status()).into());
    }

    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk?;
        let text = String::from_utf8_lossy(&bytes);
        buffer.push_str(&text);

        // SSE events are separated by double newlines.
        while let Some(boundary) = buffer.find("\n\n") {
            let event_text = buffer[..boundary].to_string();
            buffer = buffer[boundary + 2..].to_string();

            if let Some(data) = extract_sse_data(&event_text) {
                process_event(data, app);
            }
        }
    }

    Ok(())
}

/// Extract the `data:` field from an SSE event block.
fn extract_sse_data(event_text: &str) -> Option<&str> {
    for line in event_text.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            return Some(data);
        }
        if let Some(data) = line.strip_prefix("data:") {
            return Some(data.trim_start());
        }
    }
    None
}

fn emit_chat_token(app: &AppHandle, delta: &str, source: &str) {
    #[cfg(debug_assertions)]
    {
        let count = CHAT_TOKEN_EMIT_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
        if count <= 3 || count.is_multiple_of(50) {
            tracing::debug!(count = count, source = source, "emitting chat token");
        }
    }

    #[cfg(not(debug_assertions))]
    let _ = source;

    let _ = app.emit_to("main", "chat:token", delta);
}

/// Parse a single SSE data payload into frontend bridge events.
fn map_sse_payload_to_events(data: &str) -> Vec<BridgeEvent> {
    // Parse the JSON envelope.
    let Ok(envelope) = serde_json::from_str::<serde_json::Value>(data) else {
        tracing::debug!(data = data, "skipping non-JSON SSE data");
        return Vec::new();
    };

    let Some(payload) = envelope.get("payload") else {
        return Vec::new();
    };

    let Some(event_type) = payload.get("type").and_then(|t| t.as_str()) else {
        return Vec::new();
    };

    let properties = payload.get("properties").cloned().unwrap_or(serde_json::Value::Null);

    match event_type {
        // Incremental text delta — the primary streaming event.
        "message.part.delta" => {
            if let Some(delta) = properties.get("delta").and_then(|d| d.as_str()) {
                if !delta.is_empty() {
                    return vec![BridgeEvent::Token {
                        delta: delta.to_owned(),
                        source: "message.part.delta",
                    }];
                }
            }
            Vec::new()
        }

        // Part snapshot — may carry a delta for text or tool state changes.
        "message.part.updated" => handle_part_updated(&properties),

        // Message completed — emit chat:done.
        "message.updated" => {
            // Check if the message has a completed timestamp.
            if let Some(info) = properties.get("info") {
                if let Some(time) = info.get("time") {
                    if time.get("completed").is_some_and(|c| !c.is_null()) {
                        return vec![BridgeEvent::Done];
                    }
                }
            }
            Vec::new()
        }

        // Session became idle — backup completion signal.
        "session.status" => {
            if let Some(status) = properties.get("status") {
                if status.get("type").is_some_and(|t| t.as_str() == Some("idle")) {
                    return vec![BridgeEvent::Done];
                }
            }
            Vec::new()
        }

        // Heartbeat — ignore.
        "server.heartbeat" | "server.connected" => Vec::new(),

        _ => {
            tracing::trace!(event_type = event_type, "unhandled OpenCode event");
            Vec::new()
        }
    }
}

/// Process a single SSE data payload and emit the corresponding Tauri event.
fn process_event(data: &str, app: &AppHandle) {
    for event in map_sse_payload_to_events(data) {
        match event {
            BridgeEvent::Token { delta, source } => emit_chat_token(app, &delta, source),
            BridgeEvent::Done => {
                let _ = app.emit_to("main", "chat:done", ());
            }
            BridgeEvent::ToolStart(tool_name) => {
                let _ = app.emit_to("main", "chat:tool_start", tool_name);
            }
            BridgeEvent::ToolEnd(tool_name) => {
                let _ = app.emit_to("main", "chat:tool_end", tool_name);
            }
        }
    }
}

/// Handle a `message.part.updated` event.
///
/// Extracts text deltas and tool call state changes, emitting the appropriate
/// Tauri events.
fn handle_part_updated(properties: &serde_json::Value) -> Vec<BridgeEvent> {
    let Some(part) = properties.get("part") else {
        return Vec::new();
    };

    let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match part_type {
        "text" => {
            // `message.part.delta` is the single source of `chat:token` emission.
            // `message.part.updated` text events are snapshots and must not re-emit.
            #[cfg(debug_assertions)]
            if let Some(delta) = properties.get("delta").and_then(|d| d.as_str()) {
                if !delta.is_empty() {
                    tracing::debug!(
                        event = "message.part.updated",
                        part_type = "text",
                        len = delta.len(),
                        "skipping duplicate token snapshot"
                    );
                }
            }
            Vec::new()
        }
        "tool" => {
            // Emit tool call state for UI feedback.
            let tool_name = part.get("tool").and_then(|t| t.as_str()).unwrap_or("unknown");
            let state = part
                .get("state")
                .and_then(|s| s.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("");

            match state {
                "running" | "pending" => vec![BridgeEvent::ToolStart(tool_name.to_owned())],
                "completed" | "error" => vec![BridgeEvent::ToolEnd(tool_name.to_owned())],
                _ => Vec::new(),
            }
        }
        "step-finish" => {
            // Token counting event — currently ignored, could be used for UI.
            tracing::debug!("step finished");
            Vec::new()
        }
        _ => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_sse_data_parses_standard_format() {
        let event = "event: message\ndata: {\"payload\":{\"type\":\"test\"}}";
        let data = extract_sse_data(event);
        assert_eq!(data, Some("{\"payload\":{\"type\":\"test\"}}"));
    }

    #[test]
    fn extract_sse_data_handles_no_space_after_colon() {
        let event = "data:{\"key\":\"value\"}";
        let data = extract_sse_data(event);
        assert_eq!(data, Some("{\"key\":\"value\"}"));
    }

    #[test]
    fn extract_sse_data_returns_none_for_no_data() {
        let event = "event: heartbeat\nid: 123";
        assert!(extract_sse_data(event).is_none());
    }

    #[test]
    fn map_sse_delta_emits_single_token_event() {
        let payload = serde_json::json!({
            "payload": {
                "type": "message.part.delta",
                "properties": {
                    "delta": "hello"
                }
            }
        })
        .to_string();

        let events = map_sse_payload_to_events(&payload);
        assert_eq!(
            events,
            vec![BridgeEvent::Token { delta: "hello".to_owned(), source: "message.part.delta" }]
        );
    }

    #[test]
    fn map_sse_text_snapshot_emits_no_token_event() {
        let payload = serde_json::json!({
            "payload": {
                "type": "message.part.updated",
                "properties": {
                    "delta": "hello",
                    "part": {
                        "type": "text"
                    }
                }
            }
        })
        .to_string();

        let events = map_sse_payload_to_events(&payload);
        assert!(events.is_empty());
    }

    #[test]
    fn tool_state_events_map_to_start_and_end() {
        let running_payload = serde_json::json!({
            "payload": {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "tool": "bash",
                        "state": { "type": "running" }
                    }
                }
            }
        })
        .to_string();

        let done_payload = serde_json::json!({
            "payload": {
                "type": "message.part.updated",
                "properties": {
                    "part": {
                        "type": "tool",
                        "tool": "bash",
                        "state": { "type": "completed" }
                    }
                }
            }
        })
        .to_string();

        assert_eq!(
            map_sse_payload_to_events(&running_payload),
            vec![BridgeEvent::ToolStart("bash".to_owned())]
        );
        assert_eq!(
            map_sse_payload_to_events(&done_payload),
            vec![BridgeEvent::ToolEnd("bash".to_owned())]
        );
    }
}
