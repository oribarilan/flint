//! Lifecycle manager for monitor bridges.
//!
//! Owns all running per-server bridges so Flint can shut them down cleanly.

use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use crate::config::MonitoredServerConfig;

use super::bridge::MonitorBridge;
use super::ServerRegistryState;

/// Tauri managed wrapper for the monitor bridge manager.
#[derive(Clone)]
pub struct MonitorBridgeManagerState(pub Arc<Mutex<MonitorBridgeManager>>);

impl MonitorBridgeManagerState {
    /// Create an empty manager state.
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(MonitorBridgeManager::new())))
    }
}

impl Default for MonitorBridgeManagerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Tauri-managed monitor bridge manager.
pub struct MonitorBridgeManager {
    bridges: HashMap<String, MonitorBridge>,
}

impl MonitorBridgeManager {
    /// Create an empty manager.
    pub fn new() -> Self {
        Self { bridges: HashMap::new() }
    }

    /// Start bridges for all provided server configs.
    pub fn start_all(
        &mut self,
        servers: &[MonitoredServerConfig],
        registry: &ServerRegistryState,
        app: &tauri::AppHandle,
    ) {
        for server in servers {
            if self.bridges.contains_key(&server.id) {
                continue;
            }

            let bridge = MonitorBridge::start(server, registry.clone(), app.clone());
            self.bridges.insert(server.id.clone(), bridge);
        }
    }

    /// Reconcile running bridges with desired server configs.
    ///
    /// Starts bridges for missing servers and stops bridges for stale ones.
    pub fn reconcile(
        &mut self,
        desired: &[MonitoredServerConfig],
        registry: &ServerRegistryState,
        app: &tauri::AppHandle,
    ) {
        let desired_ids: HashSet<&str> = desired.iter().map(|s| s.id.as_str()).collect();

        let stale: Vec<String> =
            self.bridges.keys().filter(|id| !desired_ids.contains(id.as_str())).cloned().collect();

        for id in stale {
            if let Some(bridge) = self.bridges.remove(&id) {
                bridge.stop();
            }
        }

        for server in desired {
            if self.bridges.contains_key(&server.id) {
                continue;
            }
            let bridge = MonitorBridge::start(server, registry.clone(), app.clone());
            self.bridges.insert(server.id.clone(), bridge);
        }
    }

    /// Stop all running bridges.
    pub fn stop_all(&mut self) {
        let mut bridges = HashMap::new();
        std::mem::swap(&mut bridges, &mut self.bridges);
        for (_, bridge) in bridges {
            bridge.stop();
        }
    }

    /// Number of active bridges.
    pub fn len(&self) -> usize {
        self.bridges.len()
    }

    /// Whether no bridges are running.
    pub fn is_empty(&self) -> bool {
        self.bridges.is_empty()
    }
}

impl Default for MonitorBridgeManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manager_is_empty_by_default() {
        let mgr = MonitorBridgeManager::new();
        assert!(mgr.is_empty());
        assert_eq!(mgr.len(), 0);
    }

    #[test]
    fn stop_all_on_empty_manager_is_noop() {
        let mut mgr = MonitorBridgeManager::new();
        mgr.stop_all();
        assert!(mgr.is_empty());
    }
}
