//! Tauri IPC commands for application configuration.

use tauri::State;

use crate::config::{AppConfig, FlintConfig};
use crate::kits::{KitInfo, KitRegistryState};

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
pub fn update_config(config: State<'_, AppConfig>, new_config: FlintConfig) -> Result<(), String> {
    config.update(new_config).map_err(|e| e.to_string())
}

/// Get metadata for all registered kits.
#[tauri::command]
pub async fn get_kit_manifests(
    registry: State<'_, KitRegistryState>,
) -> Result<Vec<KitInfo>, String> {
    let reg = registry.0.read().await;
    Ok(reg.kit_infos())
}
