//! Tauri IPC commands for application configuration.

use tauri::{AppHandle, State};

use crate::config::{
    sanitize_monitored_servers, validate_monitored_servers, AppConfig, FlintConfig,
};
use crate::kits::{KitInfo, KitRegistryState};
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

    let sanitized_servers = sanitize_monitored_servers(&new_config.monitored_servers);

    {
        let mut registry = server_registry.0.write().await;
        registry.replace_config(&sanitized_servers);
    }

    {
        let mut manager = monitor_manager
            .0
            .lock()
            .map_err(|_| "monitor bridge manager lock poisoned".to_string())?;
        manager.stop_all();
        manager.start_all(&sanitized_servers, server_registry.inner(), &app);
    }

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
