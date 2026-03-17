//! SSE event bridge — subscribes to `OpenCode`'s `/global/event` stream and
//! re-emits relevant events as Tauri events for the frontend.
//!
//! Maps `OpenCode` events to the same `chat:token`, `chat:done`, `chat:error`
//! events the frontend already listens to.

use futures::StreamExt;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

use super::client::OpenCodeClient;

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

/// Process a single SSE data payload and emit the corresponding Tauri event.
fn process_event(data: &str, app: &AppHandle) {
    // Parse the JSON envelope.
    let Ok(envelope) = serde_json::from_str::<serde_json::Value>(data) else {
        tracing::debug!(data = data, "skipping non-JSON SSE data");
        return;
    };

    let Some(payload) = envelope.get("payload") else {
        return;
    };

    let Some(event_type) = payload.get("type").and_then(|t| t.as_str()) else {
        return;
    };

    let properties = payload.get("properties").cloned().unwrap_or(serde_json::Value::Null);

    match event_type {
        // Text content delta — emit as chat:token.
        "message.part.updated" => {
            handle_part_updated(&properties, app);
        }

        // Message completed — emit chat:done.
        "message.updated" => {
            // Check if the message has a completed timestamp.
            if let Some(info) = properties.get("info") {
                if let Some(time) = info.get("time") {
                    if time.get("completed").is_some_and(|c| !c.is_null()) {
                        let _ = app.emit_to("main", "chat:done", ());
                    }
                }
            }
        }

        // Session became idle — backup completion signal.
        "session.status" => {
            if let Some(status) = properties.get("status") {
                if status.get("type").is_some_and(|t| t.as_str() == Some("idle")) {
                    let _ = app.emit_to("main", "chat:done", ());
                }
            }
        }

        // Heartbeat — ignore.
        "server.heartbeat" | "server.connected" => {}

        _ => {
            tracing::trace!(event_type = event_type, "unhandled OpenCode event");
        }
    }
}

/// Handle a `message.part.updated` event.
///
/// Extracts text deltas and tool call state changes, emitting the appropriate
/// Tauri events.
fn handle_part_updated(properties: &serde_json::Value, app: &AppHandle) {
    let Some(part) = properties.get("part") else {
        return;
    };

    let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match part_type {
        "text" => {
            // Stream text delta to frontend.
            if let Some(delta) = properties.get("delta").and_then(|d| d.as_str()) {
                if !delta.is_empty() {
                    let _ = app.emit_to("main", "chat:token", delta);
                }
            }
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
                "running" | "pending" => {
                    let _ = app.emit_to("main", "chat:tool_start", tool_name);
                }
                "completed" | "error" => {
                    let _ = app.emit_to("main", "chat:tool_end", tool_name);
                }
                _ => {}
            }
        }
        "step-finish" => {
            // Token counting event — currently ignored, could be used for UI.
            tracing::debug!("step finished");
        }
        _ => {}
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
}
