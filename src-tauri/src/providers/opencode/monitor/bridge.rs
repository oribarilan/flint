//! Per-server SSE status bridge for the monitor subsystem.
//!
//! Each [`MonitorBridge`] subscribes to a single `OpenCode` server's
//! `/global/event` stream, maps lifecycle events to normalised
//! [`SessionStatus`] values, and writes updates to the shared
//! [`ServerRegistryState`].
//!
//! Design constraints:
//! - Never emits `chat:*` Tauri events — monitor events are namespaced
//!   `monitor:session_update`.
//! - Reconnects with bounded exponential back-off on any connection failure.
//! - On every reconnect, fetches the session list from `/session` to reconcile
//!   stale state.

use std::time::Duration;

use futures::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

use crate::config::MonitoredServerConfig;

use super::{
    MonitoredSession, ServerHealthStatus, ServerRegistryState, SessionStatus,
    STALE_SESSION_MAX_AGE_SECS,
};

// ---------------------------------------------------------------------------
// Back-off configuration
// ---------------------------------------------------------------------------

/// Initial reconnect delay.
const BACKOFF_INITIAL: Duration = Duration::from_secs(2);
/// Maximum reconnect delay (cap for exponential growth).
const BACKOFF_MAX: Duration = Duration::from_secs(60);
/// Multiplier applied to the delay on each successive failure.
const BACKOFF_FACTOR: u32 = 2;
/// If no event arrives for this duration, mark server as unreachable.
const STALE_HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);

// ---------------------------------------------------------------------------
// Internal normalized event
// ---------------------------------------------------------------------------

/// Normalized event extracted from the SSE stream.
#[derive(Debug, Clone, PartialEq, Eq)]
enum MonitorEvent {
    SessionStatus {
        session_id: String,
        title: String,
        status: SessionStatus,
    },
    SessionDeleted {
        session_id: String,
    },
    /// Connection-level heartbeat — confirms the stream is alive.
    Heartbeat,
    /// An event whose type is not relevant for monitoring.
    Ignored,
}

// ---------------------------------------------------------------------------
// Tauri event payload
// ---------------------------------------------------------------------------

/// Payload emitted as `monitor:session_update` for each status transition.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdatePayload {
    pub server_id: String,
    pub session_id: String,
    pub status: SessionStatus,
}

// ---------------------------------------------------------------------------
// Bridge handle
// ---------------------------------------------------------------------------

/// Handle to a running per-server SSE monitor bridge task.
///
/// Call [`MonitorBridge::stop`] to abort the background task.
/// Dropping without stopping will leak the task handle but the task continues
/// until the process exits.
pub struct MonitorBridge {
    server_id: String,
    task: JoinHandle<()>,
}

impl MonitorBridge {
    /// Spawn the monitor bridge for the given server configuration.
    ///
    /// The bridge immediately begins connecting and will reconnect automatically
    /// on failures using bounded exponential back-off.
    pub fn start(
        config: &MonitoredServerConfig,
        registry: ServerRegistryState,
        app: AppHandle,
    ) -> Self {
        let server_id = config.id.clone();
        let base_url = config.base_url();
        let sid = server_id.clone();

        let task = tokio::spawn(async move {
            run_bridge_loop(&sid, &base_url, &registry, &app).await;
        });

        tracing::info!(server_id = %server_id, "monitor bridge started");
        Self { server_id, task }
    }

    /// Abort the background bridge task.
    pub fn stop(self) {
        tracing::info!(server_id = %self.server_id, "monitor bridge stopped");
        self.task.abort();
    }

    /// Config ID of the server this bridge monitors.
    pub fn server_id(&self) -> &str {
        &self.server_id
    }
}

// ---------------------------------------------------------------------------
// Bridge event loop
// ---------------------------------------------------------------------------

/// Outer reconnect loop — runs indefinitely with bounded exponential back-off.
async fn run_bridge_loop(
    server_id: &str,
    base_url: &str,
    registry: &ServerRegistryState,
    app: &AppHandle,
) {
    let http = reqwest::Client::new();
    let mut backoff = BACKOFF_INITIAL;

    loop {
        // Mark as reconnecting before each attempt.
        {
            let mut reg = registry.0.write().await;
            reg.update_health(server_id, ServerHealthStatus::Reconnecting);
        }

        tracing::info!(server_id = server_id, base_url = base_url, "connecting to SSE stream");

        match connect_and_process(server_id, base_url, &http, registry, app).await {
            Ok(()) => {
                // Clean end — reset back-off and reconnect without delay.
                tracing::info!(server_id = server_id, "SSE stream ended cleanly, reconnecting");
                backoff = BACKOFF_INITIAL;
            }
            Err(e) => {
                tracing::warn!(
                    server_id = server_id,
                    error = %e,
                    delay_secs = backoff.as_secs(),
                    "SSE stream error, backing off"
                );

                {
                    let mut reg = registry.0.write().await;
                    reg.update_health(server_id, ServerHealthStatus::Unreachable);
                }

                tokio::time::sleep(backoff).await;
                backoff = (backoff * BACKOFF_FACTOR).min(BACKOFF_MAX);
            }
        }
    }
}

/// Single SSE connection attempt: connect → reconcile → stream events.
async fn connect_and_process(
    server_id: &str,
    base_url: &str,
    http: &reqwest::Client,
    registry: &ServerRegistryState,
    app: &AppHandle,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let sse_url = format!("{base_url}/global/event");
    let response = http.get(&sse_url).header("Accept", "text/event-stream").send().await?;

    if !response.status().is_success() {
        return Err(format!("SSE endpoint returned {}", response.status()).into());
    }

    // Mark connected and wipe stale session state.
    {
        let mut reg = registry.0.write().await;
        reg.update_health(server_id, ServerHealthStatus::Connected);
        // Wipe stale sessions for this server; reconcile will repopulate.
        reg.servers_mut_sessions_clear(server_id);
    }

    // Reconcile: pre-populate registry from current /session list.
    reconcile_sessions(server_id, base_url, http, registry, app).await;

    // Stream events indefinitely.
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    loop {
        let next_chunk =
            tokio::time::timeout(STALE_HEARTBEAT_TIMEOUT, stream.next()).await.map_err(|_| {
                tracing::warn!(
                    server_id = server_id,
                    timeout_secs = STALE_HEARTBEAT_TIMEOUT.as_secs(),
                    "monitor heartbeat timed out"
                );
                "monitor heartbeat timed out"
            })?;

        let Some(chunk) = next_chunk else {
            break;
        };

        let bytes = chunk?;
        let text = String::from_utf8_lossy(&bytes);
        buffer.push_str(&text);

        // SSE events are delimited by double newlines.
        while let Some(boundary) = buffer.find("\n\n") {
            let event_text = buffer[..boundary].to_string();
            buffer = buffer[boundary + 2..].to_string();

            if let Some(data) = extract_sse_data(&event_text) {
                if let Some(event) = map_sse_payload(data) {
                    handle_monitor_event(server_id, event, registry, app).await;
                }
            }
        }
    }

    Ok(())
}

/// Fetch the current `/session` list and upsert into the registry.
///
/// Non-fatal: errors are logged but do not abort the bridge.
async fn reconcile_sessions(
    server_id: &str,
    base_url: &str,
    http: &reqwest::Client,
    registry: &ServerRegistryState,
    app: &AppHandle,
) {
    let url = format!("{base_url}/session");

    let resp = match http.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            tracing::warn!(
                server_id = server_id,
                status = %r.status(),
                "session list returned non-success during reconcile"
            );
            return;
        }
        Err(e) => {
            tracing::warn!(server_id = server_id, error = %e, "failed to fetch session list");
            return;
        }
    };

    let sessions: Vec<serde_json::Value> = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(
                server_id = server_id,
                error = %e,
                "failed to parse session list during reconcile"
            );
            return;
        }
    };

    let count = sessions.len();

    // Collect valid (id, title) pairs first.
    let valid_sessions: Vec<(String, String)> = sessions
        .iter()
        .filter_map(|s| {
            let id = s.get("id").and_then(|v| v.as_str()).unwrap_or_default();
            if id.is_empty() {
                return None;
            }
            let title = s.get("title").and_then(|v| v.as_str()).unwrap_or_default();
            Some((id.to_owned(), title.to_owned()))
        })
        .collect();

    // Write to registry under lock, then release before emitting.
    {
        let mut reg = registry.0.write().await;
        for (id, title) in &valid_sessions {
            reg.update_session(MonitoredSession::new(
                id.clone(),
                server_id.to_owned(),
                title.clone(),
            ));
        }
    }

    // Emit UI events outside the lock.
    for (id, _) in &valid_sessions {
        let _ = app.emit(
            "monitor:session_update",
            SessionUpdatePayload {
                server_id: server_id.to_owned(),
                session_id: id.clone(),
                status: SessionStatus::Idle,
            },
        );
    }

    tracing::info!(server_id = server_id, count = count, "reconciled session list");
}

/// Apply a [`MonitorEvent`] to the registry and emit a Tauri event.
async fn handle_monitor_event(
    server_id: &str,
    event: MonitorEvent,
    registry: &ServerRegistryState,
    app: &AppHandle,
) {
    match event {
        MonitorEvent::SessionStatus { session_id, title, status } => {
            {
                let mut reg = registry.0.write().await;
                let mut session =
                    MonitoredSession::new(session_id.clone(), server_id.to_owned(), title);
                session.status = status.clone();
                reg.update_session(session);
            }
            let _ = app.emit(
                "monitor:session_update",
                SessionUpdatePayload { server_id: server_id.to_owned(), session_id, status },
            );
        }

        MonitorEvent::SessionDeleted { session_id } => {
            let mut reg = registry.0.write().await;
            if let Some(server) = reg.servers.get_mut(server_id) {
                server.sessions.remove(&session_id);
            }
        }

        MonitorEvent::Heartbeat => {
            let mut reg = registry.0.write().await;
            reg.update_health(server_id, ServerHealthStatus::Connected);
            reg.prune_stale_sessions(STALE_SESSION_MAX_AGE_SECS);
        }

        MonitorEvent::Ignored => {
            let mut reg = registry.0.write().await;
            reg.prune_stale_sessions(STALE_SESSION_MAX_AGE_SECS);
        }
    }
}

// ---------------------------------------------------------------------------
// SSE payload parsing
// ---------------------------------------------------------------------------

/// Extract the `data:` field from a raw SSE event block.
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

/// Map a raw SSE JSON payload to a [`MonitorEvent`].
///
/// Returns `None` for non-JSON or structurally unexpected payloads.
fn map_sse_payload(data: &str) -> Option<MonitorEvent> {
    let envelope: serde_json::Value = serde_json::from_str(data).ok()?;
    let payload = envelope.get("payload")?;
    let event_type = payload.get("type")?.as_str()?;
    let properties = payload.get("properties").cloned().unwrap_or(serde_json::Value::Null);

    Some(match event_type {
        // Server connectivity markers — confirm stream is alive.
        "server.connected" | "server.heartbeat" => MonitorEvent::Heartbeat,

        // Session status update — primary monitoring signal.
        "session.status" => {
            let session_id = properties
                .get("sessionID")
                .or_else(|| properties.get("session_id"))
                .and_then(|v| v.as_str())?;
            let status_type = properties
                .get("status")
                .and_then(|s| s.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("idle");

            MonitorEvent::SessionStatus {
                session_id: session_id.to_owned(),
                title: String::new(),
                status: map_status_type(status_type),
            }
        }

        // Session created or metadata updated.
        "session.updated" => {
            let info = properties.get("info").or(Some(&properties))?;
            let session_id = info.get("id").and_then(|v| v.as_str())?;
            let title = info.get("title").and_then(|v| v.as_str()).unwrap_or_default();

            properties
                .get("status")
                .and_then(|s| s.get("type"))
                .and_then(|t| t.as_str())
                .map_or_else(
                    || MonitorEvent::SessionStatus {
                        session_id: session_id.to_owned(),
                        title: title.to_owned(),
                        status: SessionStatus::Idle,
                    },
                    |status_val| MonitorEvent::SessionStatus {
                        session_id: session_id.to_owned(),
                        title: title.to_owned(),
                        status: map_status_type(status_val),
                    },
                )
        }

        // Session deleted.
        "session.deleted" => {
            let session_id = properties
                .get("sessionID")
                .or_else(|| properties.get("id"))
                .and_then(|v| v.as_str())?;
            MonitorEvent::SessionDeleted { session_id: session_id.to_owned() }
        }

        // Message completion signals an implicit status transition.
        "message.updated" => {
            let info = properties.get("info").or(Some(&properties))?;
            let session_id = info.get("sessionID").and_then(|v| v.as_str())?;

            let completed =
                info.get("time").and_then(|t| t.get("completed")).is_some_and(|c| !c.is_null());

            let status = if completed { SessionStatus::Idle } else { SessionStatus::Working };

            MonitorEvent::SessionStatus {
                session_id: session_id.to_owned(),
                title: String::new(),
                status,
            }
        }

        _ => {
            tracing::trace!(event_type = event_type, "monitor bridge: unhandled event type");
            MonitorEvent::Ignored
        }
    })
}

/// Map a raw `OpenCode` status string to a [`SessionStatus`].
///
/// Degrades gracefully to `Working` for unknown types (sprint guardrail 4).
fn map_status_type(status_type: &str) -> SessionStatus {
    match status_type {
        "idle" => SessionStatus::Idle,
        "waiting" => SessionStatus::Waiting,
        "error" => SessionStatus::Error,
        // "working", "running", "busy", or any future type → Working
        _ => SessionStatus::Working,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- heartbeat timeout config ------------------------------------------

    #[test]
    fn heartbeat_timeout_is_reasonable() {
        assert_eq!(STALE_HEARTBEAT_TIMEOUT.as_secs(), 60);
        assert!(STALE_HEARTBEAT_TIMEOUT > BACKOFF_INITIAL);
    }

    // ---- extract_sse_data ------------------------------------------------

    #[test]
    fn extract_sse_data_parses_standard_format() {
        let event = "event: message\ndata: {\"payload\":{\"type\":\"test\"}}";
        assert_eq!(extract_sse_data(event), Some("{\"payload\":{\"type\":\"test\"}}"));
    }

    #[test]
    fn extract_sse_data_handles_no_space_after_colon() {
        let event = "data:{\"key\":\"value\"}";
        assert_eq!(extract_sse_data(event), Some("{\"key\":\"value\"}"));
    }

    #[test]
    fn extract_sse_data_returns_none_for_no_data_line() {
        let event = "event: heartbeat\nid: 123";
        assert!(extract_sse_data(event).is_none());
    }

    // ---- map_status_type ------------------------------------------------

    #[test]
    fn idle_maps_to_idle() {
        assert_eq!(map_status_type("idle"), SessionStatus::Idle);
    }

    #[test]
    fn waiting_maps_to_waiting() {
        assert_eq!(map_status_type("waiting"), SessionStatus::Waiting);
    }

    #[test]
    fn error_maps_to_error() {
        assert_eq!(map_status_type("error"), SessionStatus::Error);
    }

    #[test]
    fn unknown_status_degrades_to_working() {
        assert_eq!(map_status_type("working"), SessionStatus::Working);
        assert_eq!(map_status_type("running"), SessionStatus::Working);
        assert_eq!(map_status_type("totally_unknown_state"), SessionStatus::Working);
    }

    // ---- map_sse_payload -----------------------------------------------

    #[test]
    fn session_status_idle_maps_correctly() {
        let payload = serde_json::json!({
            "payload": {
                "type": "session.status",
                "properties": {
                    "sessionID": "sess-abc",
                    "status": { "type": "idle" }
                }
            }
        })
        .to_string();

        assert_eq!(
            map_sse_payload(&payload),
            Some(MonitorEvent::SessionStatus {
                session_id: "sess-abc".to_owned(),
                title: String::new(),
                status: SessionStatus::Idle
            })
        );
    }

    #[test]
    fn session_status_working_maps_correctly() {
        let payload = serde_json::json!({
            "payload": {
                "type": "session.status",
                "properties": {
                    "sessionID": "sess-xyz",
                    "status": { "type": "working" }
                }
            }
        })
        .to_string();

        let event = map_sse_payload(&payload).unwrap();
        assert!(matches!(
            event,
            MonitorEvent::SessionStatus { status: SessionStatus::Working, .. }
        ));
    }

    #[test]
    fn session_status_waiting_maps_correctly() {
        let payload = serde_json::json!({
            "payload": {
                "type": "session.status",
                "properties": {
                    "sessionID": "sess-1",
                    "status": { "type": "waiting" }
                }
            }
        })
        .to_string();

        assert_eq!(
            map_sse_payload(&payload),
            Some(MonitorEvent::SessionStatus {
                session_id: "sess-1".to_owned(),
                title: String::new(),
                status: SessionStatus::Waiting
            })
        );
    }

    #[test]
    fn heartbeat_maps_to_heartbeat_event() {
        for t in &["server.connected", "server.heartbeat"] {
            let payload = serde_json::json!({
                "payload": { "type": t, "properties": {} }
            })
            .to_string();
            assert_eq!(map_sse_payload(&payload), Some(MonitorEvent::Heartbeat), "for type {t}");
        }
    }

    #[test]
    fn message_updated_with_completed_timestamp_maps_to_idle() {
        let payload = serde_json::json!({
            "payload": {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "sessionID": "sess-1",
                        "time": { "completed": 1_700_000_000u64 }
                    }
                }
            }
        })
        .to_string();

        assert_eq!(
            map_sse_payload(&payload),
            Some(MonitorEvent::SessionStatus {
                session_id: "sess-1".to_owned(),
                title: String::new(),
                status: SessionStatus::Idle
            })
        );
    }

    #[test]
    fn message_updated_without_completed_timestamp_maps_to_working() {
        let payload = serde_json::json!({
            "payload": {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "sessionID": "sess-2",
                        "time": {}
                    }
                }
            }
        })
        .to_string();

        assert_eq!(
            map_sse_payload(&payload),
            Some(MonitorEvent::SessionStatus {
                session_id: "sess-2".to_owned(),
                title: String::new(),
                status: SessionStatus::Working
            })
        );
    }

    #[test]
    fn session_deleted_event_maps_correctly() {
        let payload = serde_json::json!({
            "payload": {
                "type": "session.deleted",
                "properties": {
                    "sessionID": "dead-sess"
                }
            }
        })
        .to_string();

        assert_eq!(
            map_sse_payload(&payload),
            Some(MonitorEvent::SessionDeleted { session_id: "dead-sess".to_owned() })
        );
    }

    #[test]
    fn non_json_payload_returns_none() {
        assert!(map_sse_payload("not json at all").is_none());
    }

    #[test]
    fn unknown_event_type_maps_to_ignored() {
        let payload = serde_json::json!({
            "payload": {
                "type": "some.future.event",
                "properties": {}
            }
        })
        .to_string();

        assert_eq!(map_sse_payload(&payload), Some(MonitorEvent::Ignored));
    }

    // ---- back-off config sanity ------------------------------------------

    #[test]
    fn backoff_initial_is_less_than_max() {
        assert!(BACKOFF_INITIAL < BACKOFF_MAX);
    }

    #[test]
    fn backoff_doubles_on_each_step() {
        let next = BACKOFF_INITIAL * BACKOFF_FACTOR;
        assert_eq!(next, Duration::from_secs(4));
    }

    #[test]
    fn backoff_caps_at_max() {
        let very_large = Duration::from_secs(1_000);
        let capped = (very_large * BACKOFF_FACTOR).min(BACKOFF_MAX);
        assert_eq!(capped, BACKOFF_MAX);
    }
}
