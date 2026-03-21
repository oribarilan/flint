//! Auto-discovery of local `opencode serve` processes.
//!
//! Discovery is opt-in via `monitor.discovery_mode` and runs in a background
//! polling loop. It finds local `OpenCode` server processes and converts them
//! into monitor server configs for bridge reconciliation.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::{MonitorDiscoveryMode, MonitoredServerConfig};
use sysinfo::System;

/// Discovery poll interval.
pub const DISCOVERY_POLL_INTERVAL: Duration = Duration::from_secs(5);
/// Process must be seen this many scans before becoming active.
const DISCOVERY_CONFIRM_SCANS: u8 = 2;
/// Grace period before removing a disappeared process.
const DISCOVERY_GRACE_PERIOD: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
struct SeenProcess {
    host: String,
    port: u16,
    seen_count: u8,
    last_seen: Instant,
    label: Option<String>,
}

/// Shared discovery cache between polling ticks.
#[derive(Default)]
struct DiscoveryState {
    seen: HashMap<String, SeenProcess>,
}

/// Background discovery manager state.
#[derive(Clone)]
pub struct MonitorDiscoveryState(pub Arc<Mutex<MonitorDiscoveryManager>>);

impl MonitorDiscoveryState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(MonitorDiscoveryManager::new())))
    }
}

impl Default for MonitorDiscoveryState {
    fn default() -> Self {
        Self::new()
    }
}

/// Manages the polling loop task.
pub struct MonitorDiscoveryManager {
    task: Option<tokio::task::JoinHandle<()>>,
}

impl MonitorDiscoveryManager {
    pub const fn new() -> Self {
        Self { task: None }
    }

    pub fn start(
        &mut self,
        app: tauri::AppHandle,
        server_registry: super::ServerRegistryState,
        bridge_manager: super::manager::MonitorBridgeManagerState,
        config: crate::config::AppConfig,
    ) {
        if self.task.is_some() {
            return;
        }

        let state = Arc::new(Mutex::new(DiscoveryState::default()));
        self.task = Some(tokio::spawn(async move {
            loop {
                let cfg = config.get();
                let monitor_cfg = cfg.monitor.clone();

                match monitor_cfg.discovery_mode {
                    MonitorDiscoveryMode::Manual => {
                        tokio::time::sleep(DISCOVERY_POLL_INTERVAL).await;
                        continue;
                    }
                    MonitorDiscoveryMode::AutoLocal | MonitorDiscoveryMode::Hybrid => {
                        let discovered = discover_local_servers(&state);
                        let merged = match monitor_cfg.discovery_mode {
                            MonitorDiscoveryMode::AutoLocal => discovered,
                            MonitorDiscoveryMode::Hybrid => {
                                merge_manual_and_discovered(&cfg.monitored_servers, &discovered)
                            }
                            MonitorDiscoveryMode::Manual => Vec::new(),
                        };

                        {
                            let mut reg = server_registry.0.write().await;
                            reg.replace_config(&merged);
                            reg.set_max_recent_sessions(monitor_cfg.max_recent_sessions.max(1));
                        }

                        if let Ok(mut manager) = bridge_manager.0.lock() {
                            manager.reconcile(&merged, &server_registry, &app);
                        }
                    }
                }

                tokio::time::sleep(DISCOVERY_POLL_INTERVAL).await;
            }
        }));
    }

    pub fn stop(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }

    pub const fn is_running(&self) -> bool {
        self.task.is_some()
    }
}

impl Default for MonitorDiscoveryManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Recompute desired monitor servers from config + discovery mode.
pub fn resolve_desired_servers(cfg: &crate::config::FlintConfig) -> Vec<MonitoredServerConfig> {
    let discovered = if matches!(
        cfg.monitor.discovery_mode,
        MonitorDiscoveryMode::AutoLocal | MonitorDiscoveryMode::Hybrid
    ) {
        scan_opencode_processes()
    } else {
        Vec::new()
    };

    match cfg.monitor.discovery_mode {
        MonitorDiscoveryMode::Manual => cfg.monitored_servers.clone(),
        MonitorDiscoveryMode::AutoLocal => discovered,
        MonitorDiscoveryMode::Hybrid => {
            merge_manual_and_discovered(&cfg.monitored_servers, &discovered)
        }
    }
}

/// Recompute desired monitor servers from config + discovery mode.
pub async fn apply_monitor_topology(
    app: &tauri::AppHandle,
    cfg: &crate::config::FlintConfig,
    server_registry: &super::ServerRegistryState,
    bridge_manager: &super::manager::MonitorBridgeManagerState,
) {
    let desired = resolve_desired_servers(cfg);

    {
        let mut reg = server_registry.0.write().await;
        reg.replace_config(&desired);
        reg.set_max_recent_sessions(cfg.monitor.max_recent_sessions.max(1));
    }

    if let Ok(mut manager) = bridge_manager.0.lock() {
        manager.reconcile(&desired, server_registry, app);
    }
}

/// Start/stop background discovery loop based on config mode.
pub fn reconcile_discovery_loop(
    app: &tauri::AppHandle,
    cfg: &crate::config::FlintConfig,
    discovery_state: &MonitorDiscoveryState,
    server_registry: &super::ServerRegistryState,
    bridge_manager: &super::manager::MonitorBridgeManagerState,
    app_config: &crate::config::AppConfig,
) {
    let should_run = matches!(
        cfg.monitor.discovery_mode,
        MonitorDiscoveryMode::AutoLocal | MonitorDiscoveryMode::Hybrid
    );

    let Ok(mut discovery) = discovery_state.0.lock() else {
        tracing::warn!("monitor discovery manager lock poisoned");
        return;
    };

    if should_run {
        if !discovery.is_running() {
            discovery.start(
                app.clone(),
                server_registry.clone(),
                bridge_manager.clone(),
                app_config.clone(),
            );
        }
    } else {
        discovery.stop();
    }
}

fn discover_local_servers(state: &Arc<Mutex<DiscoveryState>>) -> Vec<MonitoredServerConfig> {
    let now = Instant::now();
    let current_scan = scan_opencode_processes();

    let Ok(mut guard) = state.lock() else {
        return Vec::new();
    };

    for server in &current_scan {
        let id = discovered_server_id(&server.host, server.port);
        let entry = guard.seen.entry(id).or_insert_with(|| SeenProcess {
            host: server.host.clone(),
            port: server.port,
            seen_count: 0,
            last_seen: now,
            label: server.label.clone(),
        });
        entry.host.clone_from(&server.host);
        entry.port = server.port;
        entry.last_seen = now;
        entry.label.clone_from(&server.label);
        entry.seen_count = entry.seen_count.saturating_add(1).min(10);
    }

    // Prune disappeared processes after grace period.
    guard.seen.retain(|_, seen| now.duration_since(seen.last_seen) <= DISCOVERY_GRACE_PERIOD);

    guard
        .seen
        .iter()
        .filter(|(_, seen)| seen.seen_count >= DISCOVERY_CONFIRM_SCANS)
        .map(|(id, seen)| MonitoredServerConfig {
            id: id.clone(),
            host: seen.host.clone(),
            port: seen.port,
            label: seen.label.clone(),
        })
        .collect()
}

fn scan_opencode_processes() -> Vec<MonitoredServerConfig> {
    let mut system = System::new_all();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut out = Vec::new();

    for process in system.processes().values() {
        let args: Vec<String> =
            process.cmd().iter().map(|s| s.to_string_lossy().to_string()).collect();

        if !looks_like_opencode_serve(&args) {
            continue;
        }

        let host = parse_arg_value(&args, "--hostname").unwrap_or_else(|| "127.0.0.1".to_string());
        if !is_local_host(&host) {
            continue;
        }

        let Some(port) = parse_arg_value(&args, "--port").and_then(|p| p.parse::<u16>().ok())
        else {
            continue;
        };
        if port == 0 {
            continue;
        }

        let label = process.cwd().and_then(|p| {
            p.file_name().and_then(|name| {
                let candidate = name.to_string_lossy().trim().to_string();
                if candidate.is_empty() {
                    None
                } else {
                    Some(candidate)
                }
            })
        });

        out.push(MonitoredServerConfig {
            id: discovered_server_id(&host, port),
            host,
            port,
            label,
        });
    }

    out.sort_by(|a, b| a.id.cmp(&b.id));
    out.dedup_by(|a, b| a.host == b.host && a.port == b.port);
    out
}

fn merge_manual_and_discovered(
    manual: &[MonitoredServerConfig],
    discovered: &[MonitoredServerConfig],
) -> Vec<MonitoredServerConfig> {
    let mut merged = manual.to_vec();

    for d in discovered {
        let duplicate = merged.iter().any(|m| {
            // keep user-managed IDs and avoid host:port duplicates
            m.id == d.id || (m.host == d.host && m.port == d.port)
        });
        if !duplicate {
            merged.push(d.clone());
        }
    }

    merged
}

fn discovered_server_id(host: &str, port: u16) -> String {
    format!("discovered:{host}:{port}")
}

fn parse_arg_value(args: &[String], key: &str) -> Option<String> {
    for (idx, arg) in args.iter().enumerate() {
        if arg == key {
            return args.get(idx + 1).cloned();
        }
        if let Some(value) = arg.strip_prefix(&format!("{key}=")) {
            return Some(value.to_string());
        }
    }
    None
}

fn looks_like_opencode_serve(args: &[String]) -> bool {
    if args.is_empty() {
        return false;
    }

    let has_serve = args.iter().any(|a| a == "serve");
    if !has_serve {
        return false;
    }

    // Accept either full path ending in opencode or direct binary name.
    args.iter().any(|a| a.ends_with("opencode") || a.ends_with("opencode.exe"))
}

fn is_local_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "::1")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_arg_value_supports_space_and_equals_forms() {
        let args = vec!["opencode", "serve", "--port", "14096", "--hostname=127.0.0.1"]
            .into_iter()
            .map(String::from)
            .collect::<Vec<_>>();

        assert_eq!(parse_arg_value(&args, "--port"), Some("14096".to_string()));
        assert_eq!(parse_arg_value(&args, "--hostname"), Some("127.0.0.1".to_string()));
    }

    #[test]
    fn local_host_filter_accepts_loopback_only() {
        assert!(is_local_host("127.0.0.1"));
        assert!(is_local_host("localhost"));
        assert!(is_local_host("::1"));
        assert!(!is_local_host("192.168.1.10"));
    }

    #[test]
    fn merge_manual_and_discovered_prefers_manual_host_port() {
        let manual = vec![MonitoredServerConfig {
            id: "manual".to_string(),
            host: "127.0.0.1".to_string(),
            port: 14096,
            label: Some("Manual".to_string()),
        }];
        let discovered = vec![MonitoredServerConfig {
            id: "discovered:127.0.0.1:14096".to_string(),
            host: "127.0.0.1".to_string(),
            port: 14096,
            label: Some("Disc".to_string()),
        }];

        let merged = merge_manual_and_discovered(&manual, &discovered);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].id, "manual");
    }

    #[test]
    fn resolve_desired_servers_manual_uses_manual_list_only() {
        let cfg = crate::config::FlintConfig {
            monitor: crate::config::MonitorConfig {
                discovery_mode: crate::config::MonitorDiscoveryMode::Manual,
                max_recent_sessions: 50,
            },
            monitored_servers: vec![MonitoredServerConfig {
                id: "m1".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14096,
                label: None,
            }],
            ..Default::default()
        };

        let desired = resolve_desired_servers(&cfg);
        assert_eq!(desired.len(), 1);
        assert_eq!(desired[0].id, "m1");
    }

    #[test]
    fn discovered_server_id_is_stable() {
        assert_eq!(discovered_server_id("127.0.0.1", 14096), "discovered:127.0.0.1:14096");
    }

    #[test]
    fn looks_like_opencode_serve_requires_binary_and_subcommand() {
        let good = vec!["opencode".to_string(), "serve".to_string(), "--port".to_string()];
        assert!(looks_like_opencode_serve(&good));

        let bad = vec!["opencode".to_string(), "chat".to_string()];
        assert!(!looks_like_opencode_serve(&bad));
    }
}
