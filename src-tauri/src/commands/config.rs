//! Tauri IPC commands for application configuration.

use tauri::{AppHandle, State};

use crate::config::{
    clamp_monitor_recent_sessions, sanitize_monitored_servers, validate_monitored_servers,
    AppConfig, FlintConfig,
};
use crate::kits::{KitInfo, KitRegistryState};
use crate::providers::opencode::monitor::discovery::{
    apply_monitor_topology, reconcile_discovery_loop, MonitorDiscoveryState,
};
use crate::providers::opencode::monitor::manager::MonitorBridgeManagerState;
use crate::providers::opencode::monitor::ServerRegistryState;

/// Get the current application config.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn get_config(config: State<'_, AppConfig>) -> FlintConfig {
    config.get()
}

/// Get the compile-time default config.
#[tauri::command]
pub fn get_default_config() -> FlintConfig {
    FlintConfig::default()
}

/// Update the application config and persist to disk.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn update_config(
    app: AppHandle,
    config: State<'_, AppConfig>,
    server_registry: State<'_, ServerRegistryState>,
    monitor_manager: State<'_, MonitorBridgeManagerState>,
    monitor_discovery: State<'_, MonitorDiscoveryState>,
    new_config: FlintConfig,
) -> Result<(), String> {
    // Validate monitored server input to keep backend state authoritative.
    let validation_errors = validate_monitored_servers(&new_config.monitored_servers);
    if !validation_errors.is_empty() {
        let message =
            validation_errors.into_iter().map(|e| e.to_string()).collect::<Vec<_>>().join("; ");
        return Err(message);
    }

    config.update(new_config.clone()).map_err(|e| e.to_string())?;

    let mut normalized_config = new_config;
    normalized_config.monitored_servers =
        sanitize_monitored_servers(&normalized_config.monitored_servers);
    normalized_config.monitor.max_recent_sessions =
        clamp_monitor_recent_sessions(normalized_config.monitor.max_recent_sessions);

    apply_monitor_topology(
        &app,
        &normalized_config,
        server_registry.inner(),
        monitor_manager.inner(),
    )
    .await;
    reconcile_discovery_loop(
        &app,
        &normalized_config,
        monitor_discovery.inner(),
        server_registry.inner(),
        monitor_manager.inner(),
        config.inner(),
    );

    Ok(())
}

/// Get metadata for all registered kits.
#[tauri::command]
pub async fn get_kit_manifests(
    registry: State<'_, KitRegistryState>,
) -> Result<Vec<KitInfo>, String> {
    let reg = registry.0.read().await;
    Ok(reg.kit_infos())
}
