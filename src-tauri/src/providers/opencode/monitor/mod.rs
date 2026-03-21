//! Monitor subsystem — multi-server `OpenCode` session status tracking.
//!
//! Sub-modules:
//! - [`bridge`] — per-server SSE ingestion and status mapping (ticket 2)
//!
//! This module owns the in-memory snapshots of all monitored `OpenCode` servers and
//! their active sessions. The Sessions kit reads from these snapshots on every
//! keystroke — all reads are synchronous and allocation-light; no I/O in the hot
//! path.
//!
//! The SSE bridge updates state via `ServerRegistry::update_*` methods.
//! The settings UI adds/removes servers via `ServerRegistry::replace_config`.

pub mod bridge;
pub mod manager;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

// ---------------------------------------------------------------------------
// Public managed-state wrapper
// ---------------------------------------------------------------------------

/// Tauri managed state wrapping the registry behind an async `RwLock`.
#[derive(Clone)]
pub struct ServerRegistryState(pub Arc<RwLock<ServerRegistry>>);

impl ServerRegistryState {
    /// Create with an empty registry.
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(ServerRegistry::new())))
    }
}

impl Default for ServerRegistryState {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

/// Connectivity / health status of a monitored server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ServerHealthStatus {
    /// Not yet attempted.
    #[default]
    Unknown,
    /// SSE stream is connected and heartbeating.
    Connected,
    /// Connection lost — background reconnect in progress.
    Reconnecting,
    /// Server confirmed unreachable.
    Unreachable,
}

impl ServerHealthStatus {
    /// Human-readable display label.
    pub const fn label(&self) -> &'static str {
        match self {
            Self::Unknown => "Unknown",
            Self::Connected => "Connected",
            Self::Reconnecting => "Reconnecting",
            Self::Unreachable => "Unreachable",
        }
    }
}

/// Work status of an `OpenCode` session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    /// No pending work.
    #[default]
    Idle,
    /// Active agent run in progress.
    Working,
    /// Agent run stalled, waiting on external input or tool permission.
    Waiting,
    /// Last run ended with an error.
    Error,
}

impl SessionStatus {
    /// Human-readable display label.
    pub const fn label(&self) -> &'static str {
        match self {
            Self::Idle => "Idle",
            Self::Working => "Working",
            Self::Waiting => "Waiting",
            Self::Error => "Error",
        }
    }

    /// Badge color token for frontend rendering.
    pub const fn badge_color(&self) -> &'static str {
        match self {
            Self::Idle => "var(--text-placeholder)",
            Self::Working => "var(--color-success)",
            Self::Waiting => "var(--color-warning)",
            Self::Error => "var(--color-error)",
        }
    }
}

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

/// Runtime snapshot of a monitored session.
#[derive(Debug, Clone)]
pub struct MonitoredSession {
    /// Session ID from `OpenCode`.
    pub session_id: String,
    /// Owning server ID.
    pub server_id: String,
    /// Human-readable session title (from `OpenCode`).
    pub title: String,
    /// Current work status.
    pub status: SessionStatus,
    /// Wall-clock time of last status update.
    pub updated_at: SystemTime,
}

impl MonitoredSession {
    /// Create a new session snapshot.
    pub fn new(session_id: String, server_id: String, title: String) -> Self {
        Self {
            session_id,
            server_id,
            title,
            status: SessionStatus::Idle,
            updated_at: SystemTime::now(),
        }
    }

    /// Seconds since last update, capped at `u32::MAX`.
    pub fn age_seconds(&self) -> u32 {
        self.updated_at.elapsed().unwrap_or_default().as_secs().try_into().unwrap_or(u32::MAX)
    }
}

/// Runtime health snapshot for a monitored server.
#[derive(Debug, Clone)]
pub struct MonitoredServer {
    /// Server ID (matches config).
    pub server_id: String,
    /// Display label (from config).
    pub label: String,
    /// Host (e.g., `"localhost"`).
    pub host: String,
    /// Port (e.g., `14096`).
    pub port: u16,
    /// Current health status.
    pub health: ServerHealthStatus,
    /// All known sessions on this server.
    pub sessions: HashMap<String, MonitoredSession>,
}

impl MonitoredServer {
    /// Create from config, starting in `Unknown` health.
    pub fn new(server_id: String, label: String, host: String, port: u16) -> Self {
        Self {
            server_id,
            label,
            host,
            port,
            health: ServerHealthStatus::Unknown,
            sessions: HashMap::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// In-memory registry of monitored `OpenCode` servers and their sessions.
///
/// All mutation happens through the `update_*` and `replace_config` methods.
/// Reads (for kit search) call `sessions_snapshot()` which returns a cloned
/// `Vec` — no locks held during the caller's iteration.
pub struct ServerRegistry {
    pub(super) servers: HashMap<String, MonitoredServer>,
}

/// Maximum sessions tracked per server (oldest are pruned).
pub const MAX_SESSIONS_PER_SERVER: usize = 100;

/// Sessions older than this are pruned during maintenance.
pub const STALE_SESSION_MAX_AGE_SECS: u64 = 24 * 60 * 60;

impl ServerRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self { servers: HashMap::new() }
    }

    /// Replace all servers with entries derived from config.
    ///
    /// Existing sessions and health for servers whose IDs are retained are
    /// preserved. New servers start with `Unknown` health and no sessions.
    pub fn replace_config(&mut self, configs: &[crate::config::MonitoredServerConfig]) {
        let mut next: HashMap<String, MonitoredServer> = HashMap::new();
        for cfg in configs {
            let entry = if let Some(existing) = self.servers.remove(&cfg.id) {
                // Carry forward health + sessions but update display fields.
                MonitoredServer {
                    server_id: existing.server_id,
                    label: cfg.label.clone().unwrap_or_else(|| cfg.host.clone()),
                    host: cfg.host.clone(),
                    port: cfg.port,
                    health: existing.health,
                    sessions: existing.sessions,
                }
            } else {
                MonitoredServer::new(
                    cfg.id.clone(),
                    cfg.label.clone().unwrap_or_else(|| cfg.host.clone()),
                    cfg.host.clone(),
                    cfg.port,
                )
            };
            next.insert(cfg.id.clone(), entry);
        }
        self.servers = next;
    }

    /// Update (or insert) a session snapshot.
    pub fn update_session(&mut self, session: MonitoredSession) {
        if let Some(server) = self.servers.get_mut(&session.server_id) {
            server.sessions.insert(session.session_id.clone(), session);
            Self::enforce_server_session_cap(server);
        }
    }

    /// Update the health of a server.
    pub fn update_health(&mut self, server_id: &str, health: ServerHealthStatus) {
        if let Some(server) = self.servers.get_mut(server_id) {
            server.health = health;
        }
    }

    /// Remove a server and all its sessions.
    pub fn remove_server(&mut self, server_id: &str) {
        self.servers.remove(server_id);
    }

    /// Return a flat snapshot of all sessions across all servers, sorted by
    /// `updated_at` descending (most recently active first).
    ///
    /// This clone is cheap for typical counts (<50 sessions) and keeps the
    /// hot path (kit search) allocation-bounded.
    pub fn sessions_snapshot(&self) -> Vec<SessionSnapshot> {
        let mut out: Vec<SessionSnapshot> = self
            .servers
            .values()
            .flat_map(|server| {
                server.sessions.values().map(|session| SessionSnapshot {
                    session_id: session.session_id.clone(),
                    server_id: server.server_id.clone(),
                    server_label: server.label.clone(),
                    title: session.title.clone(),
                    status: session.status.clone(),
                    age_seconds: session.age_seconds(),
                    server_health: server.health.clone(),
                })
            })
            .collect();

        out.sort_unstable_by_key(|s| s.age_seconds);
        out
    }

    /// Remove stale sessions across all servers.
    pub fn prune_stale_sessions(&mut self, max_age_seconds: u64) {
        for server in self.servers.values_mut() {
            server.sessions.retain(|_, s| u64::from(s.age_seconds()) <= max_age_seconds);
            Self::enforce_server_session_cap(server);
        }
    }

    /// Total number of monitored servers.
    pub fn server_count(&self) -> usize {
        self.servers.len()
    }

    /// Total number of known sessions across all servers.
    pub fn session_count(&self) -> usize {
        self.servers.values().map(|s| s.sessions.len()).sum()
    }

    /// Clear all sessions for a server (called on reconnect to discard stale state).
    pub fn servers_mut_sessions_clear(&mut self, server_id: &str) {
        if let Some(server) = self.servers.get_mut(server_id) {
            server.sessions.clear();
        }
    }

    fn enforce_server_session_cap(server: &mut MonitoredServer) {
        if server.sessions.len() <= MAX_SESSIONS_PER_SERVER {
            return;
        }

        let mut by_recency: Vec<(String, SystemTime)> =
            server.sessions.iter().map(|(id, s)| (id.clone(), s.updated_at)).collect();

        // oldest first
        by_recency.sort_unstable_by_key(|(_, t)| *t);

        let to_remove = by_recency.len().saturating_sub(MAX_SESSIONS_PER_SERVER);
        for (session_id, _) in by_recency.into_iter().take(to_remove) {
            server.sessions.remove(&session_id);
        }
    }
}

impl Default for ServerRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// A flat, cloneable snapshot of one session for kit search.
#[derive(Debug, Clone)]
pub struct SessionSnapshot {
    pub session_id: String,
    pub server_id: String,
    pub server_label: String,
    pub title: String,
    pub status: SessionStatus,
    /// Seconds since last update (lower = more recent).
    pub age_seconds: u32,
    pub server_health: ServerHealthStatus,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::MonitoredServerConfig;

    fn cfg(id: &str, host: &str, port: u16) -> MonitoredServerConfig {
        MonitoredServerConfig { id: id.to_string(), host: host.to_string(), port, label: None }
    }

    #[test]
    fn new_registry_is_empty() {
        let reg = ServerRegistry::new();
        assert_eq!(reg.server_count(), 0);
        assert_eq!(reg.session_count(), 0);
        assert!(reg.sessions_snapshot().is_empty());
    }

    #[test]
    fn replace_config_adds_servers() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096), cfg("s2", "localhost", 14097)]);
        assert_eq!(reg.server_count(), 2);
    }

    #[test]
    fn replace_config_removes_absent_servers() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096), cfg("s2", "localhost", 14097)]);
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);
        assert_eq!(reg.server_count(), 1);
        assert!(reg.servers.contains_key("s1"));
    }

    #[test]
    fn replace_config_preserves_existing_health() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);
        reg.update_health("s1", ServerHealthStatus::Connected);
        // Replace with same config — health should be retained.
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);
        assert_eq!(reg.servers["s1"].health, ServerHealthStatus::Connected);
    }

    #[test]
    fn replace_config_uses_host_as_fallback_label() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "my-host", 14096)]);
        assert_eq!(reg.servers["s1"].label, "my-host");
    }

    #[test]
    fn replace_config_uses_explicit_label() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[MonitoredServerConfig {
            id: "s1".to_string(),
            host: "localhost".to_string(),
            port: 14096,
            label: Some("Work brain".to_string()),
        }]);
        assert_eq!(reg.servers["s1"].label, "Work brain");
    }

    #[test]
    fn update_session_inserts_into_server() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);
        let session =
            MonitoredSession::new("sess-1".to_string(), "s1".to_string(), "My Work".to_string());
        reg.update_session(session);
        assert_eq!(reg.session_count(), 1);
    }

    #[test]
    fn update_session_for_unknown_server_is_no_op() {
        let mut reg = ServerRegistry::new();
        let session =
            MonitoredSession::new("s".to_string(), "no-server".to_string(), "t".to_string());
        reg.update_session(session);
        assert_eq!(reg.session_count(), 0);
    }

    #[test]
    fn update_health_changes_health_field() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);
        assert_eq!(reg.servers["s1"].health, ServerHealthStatus::Unknown);
        reg.update_health("s1", ServerHealthStatus::Connected);
        assert_eq!(reg.servers["s1"].health, ServerHealthStatus::Connected);
    }

    #[test]
    fn update_health_for_unknown_server_is_no_op() {
        let mut reg = ServerRegistry::new();
        reg.update_health("ghost", ServerHealthStatus::Connected); // should not panic
        assert_eq!(reg.server_count(), 0);
    }

    #[test]
    fn remove_server_drops_all_sessions() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);
        reg.update_session(MonitoredSession::new(
            "sess-1".to_string(),
            "s1".to_string(),
            "t".to_string(),
        ));
        assert_eq!(reg.session_count(), 1);
        reg.remove_server("s1");
        assert_eq!(reg.server_count(), 0);
        assert_eq!(reg.session_count(), 0);
    }

    #[test]
    fn sessions_snapshot_is_sorted_by_age_ascending() {
        use std::time::Duration;

        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);

        let mut old_session =
            MonitoredSession::new("old".to_string(), "s1".to_string(), "Old".to_string());
        old_session.updated_at = SystemTime::now() - Duration::from_secs(60);

        let recent_session =
            MonitoredSession::new("new".to_string(), "s1".to_string(), "New".to_string());

        reg.update_session(old_session);
        reg.update_session(recent_session);

        let snapshot = reg.sessions_snapshot();
        assert_eq!(snapshot.len(), 2);
        // Most recent first (age_seconds lower)
        assert_eq!(snapshot[0].session_id, "new");
        assert_eq!(snapshot[1].session_id, "old");
    }

    #[test]
    fn session_status_labels_are_non_empty() {
        for status in [
            SessionStatus::Idle,
            SessionStatus::Working,
            SessionStatus::Waiting,
            SessionStatus::Error,
        ] {
            assert!(!status.label().is_empty());
        }
    }

    #[test]
    fn server_health_labels_are_non_empty() {
        for health in [
            ServerHealthStatus::Unknown,
            ServerHealthStatus::Connected,
            ServerHealthStatus::Reconnecting,
            ServerHealthStatus::Unreachable,
        ] {
            assert!(!health.label().is_empty());
        }
    }

    #[test]
    fn update_session_enforces_per_server_cap() {
        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);

        for i in 0..(MAX_SESSIONS_PER_SERVER + 10) {
            reg.update_session(MonitoredSession::new(
                format!("sess-{i}"),
                "s1".to_string(),
                format!("Session {i}"),
            ));
        }

        assert_eq!(reg.servers["s1"].sessions.len(), MAX_SESSIONS_PER_SERVER);
    }

    #[test]
    fn prune_stale_sessions_removes_old_entries() {
        use std::time::Duration;

        let mut reg = ServerRegistry::new();
        reg.replace_config(&[cfg("s1", "localhost", 14096)]);

        let recent =
            MonitoredSession::new("recent".to_string(), "s1".to_string(), "Recent".to_string());

        let mut old = MonitoredSession::new("old".to_string(), "s1".to_string(), "Old".to_string());
        old.updated_at = SystemTime::now() - Duration::from_secs(STALE_SESSION_MAX_AGE_SECS + 1);

        reg.update_session(recent);
        reg.update_session(old);
        assert_eq!(reg.session_count(), 2);

        reg.prune_stale_sessions(STALE_SESSION_MAX_AGE_SECS);
        assert_eq!(reg.session_count(), 1);
        assert!(reg.servers["s1"].sessions.contains_key("recent"));
    }
}
