//! Flint — AI-native application launcher.
//!
//! This crate wires up the Tauri application: plugins, commands,
//! global hotkey, system tray, and background file indexing.

mod commands;
pub mod config;
mod error;
mod focus;
#[cfg(target_os = "macos")]
mod icons;
pub mod indexer;
pub mod kits;
mod opencode_project_config;
pub mod providers;
pub mod search;
mod tray;
mod window;

use std::sync::Arc;

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use error::StringResult;
use tracing_subscriber::EnvFilter;

use indexer::AppIndex;
use kits::{CommandMode, KitContextBase, KitIcon, KitRegistry, KitRegistryState};
use providers::opencode::monitor::discovery::{
    apply_monitor_topology, reconcile_discovery_loop, MonitorDiscoveryState,
};
use providers::opencode::monitor::manager::MonitorBridgeManagerState;
use providers::opencode::monitor::ServerRegistryState;
use providers::opencode::{OpenCodeProvider, OpenCodeProviderState};

/// Payload emitted to the frontend when a global command hotkey is pressed
/// for an `InputResults`-mode command, instructing it to activate the chip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandActivatePayload {
    kit_id: String,
    command_id: String,
    name: String,
    icon: Option<KitIcon>,
}

/// Boot the Tauri application.
///
/// Initialises tracing, registers plugins, commands, hotkey, and the
/// system tray, spawns background file indexing, then enters the event loop.
#[allow(clippy::too_many_lines)]
pub fn run() {
    // Initialise structured logging; default to `info` if RUST_LOG is unset.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::window::toggle_window,
            commands::window::show_window,
            commands::window::hide_window,
            commands::window::open_settings,
            commands::search::search_files,
            commands::search::search_all,
            commands::search::search_command,
            commands::search::execute_command,
            commands::search::handle_custom_action,
            commands::files::open_file,
            commands::files::reveal_in_file_manager,
            commands::files::delete_to_trash,
            commands::files::open_in_editor,
            commands::files::open_in_terminal,
            commands::files::get_app_icon,
            commands::chat::get_chat_status,
            commands::chat::send_chat_message,
            commands::chat::get_available_models,
            commands::chat::get_project_model_config_status,
            commands::chat::set_project_default_model,
            commands::chat::abort_chat,
            commands::chat::clear_chat,
            commands::chat::get_session_messages,
            commands::chat::init_opencode,
            commands::config::get_config,
            commands::config::get_default_config,
            commands::config::update_config,
            commands::config::get_kit_manifests,
        ])
        .setup(|app| {
            // Load application config (or use defaults).
            let cfg = config::load_or_default();

            // Register main toggle hotkey from config.
            let main_hotkey = cfg.general.hotkey.as_str();
            app.global_shortcut()
                .on_shortcut(main_hotkey, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = window::toggle(app);
                    }
                })
                .str_err()?;

            // Build system tray icon + menu.
            tray::setup(app)?;

            // Initialise OpenCode provider as managed state.
            let opencode = OpenCodeProvider::new();
            let opencode_state =
                OpenCodeProviderState(Arc::new(tokio::sync::RwLock::new(opencode)));
            app.manage(opencode_state.clone());

            // Start the OpenCode server only if a second brain repo is configured.
            // No fallback — chat is locked until the user configures a repo in Settings.
            if let Some(ref repo) = cfg.second_brain.repo_path {
                let path = std::path::PathBuf::from(repo);
                let app_handle = app.handle().clone();
                let state = opencode_state;
                tauri::async_runtime::spawn(async move {
                    let mut provider: tokio::sync::RwLockWriteGuard<'_, OpenCodeProvider> =
                        state.0.write().await;
                    if let Err(e) = provider.init(&path, &app_handle).await {
                        tracing::warn!(
                            error = %e,
                            "failed to start OpenCode server on launch"
                        );
                    }
                });
            } else {
                tracing::info!("second brain repo not configured — skipping OpenCode init");
            }

            // Manage application config.
            let app_config = config::AppConfig::new(cfg);
            let kit_config = app_config.get();
            app.manage(app_config.clone());

            // Initialise the server monitor registry and seed it from config.
            let server_registry_state = ServerRegistryState::new();
            app.manage(server_registry_state.clone());

            let bridge_manager_state = MonitorBridgeManagerState::new();
            app.manage(bridge_manager_state.clone());

            let discovery_state = MonitorDiscoveryState::new();
            app.manage(discovery_state.clone());

            // Seed monitor topology and start optional discovery loop.
            {
                let mut startup_cfg = kit_config.clone();
                startup_cfg.monitored_servers =
                    config::sanitize_monitored_servers(&startup_cfg.monitored_servers);
                startup_cfg.monitor.max_recent_sessions =
                    config::clamp_monitor_recent_sessions(startup_cfg.monitor.max_recent_sessions);

                let app_handle = app.handle().clone();
                let server_registry_for_task = server_registry_state.clone();
                let bridge_manager_for_task = bridge_manager_state.clone();
                tauri::async_runtime::spawn(async move {
                    apply_monitor_topology(
                        &app_handle,
                        &startup_cfg,
                        &server_registry_for_task,
                        &bridge_manager_for_task,
                    )
                    .await;

                    tracing::info!("monitor topology initialized");
                });

                let mut loop_cfg = app_config.get();
                loop_cfg.monitor.max_recent_sessions =
                    config::clamp_monitor_recent_sessions(loop_cfg.monitor.max_recent_sessions);
                reconcile_discovery_loop(
                    &app.handle().clone(),
                    &loop_cfg,
                    &discovery_state,
                    &server_registry_state,
                    &bridge_manager_state,
                    &app_config,
                );
            }

            // Initialise kit registry and register built-in kits.
            let kit_ctx_base = KitContextBase {
                app: app.handle().clone(),
                config: app_config,
                http: reqwest::Client::new(),
                base_data_dir: config::config_base_dir().join("flint").join("kits"),
            };
            let kit_ctx_for_eager = kit_ctx_base.clone();
            app.manage(kit_ctx_base);

            let mut registry = KitRegistry::new();
            registry.register(Box::new(kits::CalculatorKit::new()), &kit_config);
            registry.register(Box::new(kits::WindowManagementKit::new()), &kit_config);
            registry.register(Box::new(kits::ClipboardKit::new(&kit_config)), &kit_config);
            registry.register(
                Box::new(kits::SessionsKit::new(Arc::clone(&server_registry_state.0))),
                &kit_config,
            );

            // Eagerly init kits that run background tasks (e.g., clipboard watcher).
            let eager_ids = registry.eager_init_kit_ids();

            // Register per-command global shortcuts.
            register_command_shortcuts(app, &registry);

            let registry_arc = Arc::new(tokio::sync::RwLock::new(registry));
            app.manage(KitRegistryState(registry_arc.clone()));

            // Spawn eager init in background (async — can't await in setup).
            if !eager_ids.is_empty() {
                tauri::async_runtime::spawn(async move {
                    let mut reg = registry_arc.write().await;
                    for id in &eager_ids {
                        if let Err(e) = reg.ensure_init(id, &kit_ctx_for_eager).await {
                            tracing::warn!(kit = %id, error = %e, "eager kit init failed");
                        }
                    }
                });
            }

            // Discover applications via Spotlight (macOS) for instant search.
            #[cfg(target_os = "macos")]
            let apps = indexer::spotlight::discover_apps().unwrap_or_else(|e| {
                tracing::warn!("failed to discover apps via Spotlight: {e}");
                Vec::new()
            });
            #[cfg(not(target_os = "macos"))]
            let apps = Vec::new();

            tracing::info!("preloaded {} apps", apps.len());
            app.manage(AppIndex(apps));

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                // Best-effort cleanup: when main window is destroyed during app shutdown,
                // stop monitor bridges.
                if window.label() == "main" {
                    let app = window.app_handle();
                    if let Some(manager_state) = app.try_state::<MonitorBridgeManagerState>() {
                        if let Ok(mut manager) = manager_state.0.lock() {
                            manager.stop_all();
                        }
                    }
                    if let Some(discovery_state) = app.try_state::<MonitorDiscoveryState>() {
                        if let Ok(mut discovery) = discovery_state.0.lock() {
                            discovery.stop();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Register a global shortcut for each command that has a hotkey assigned.
///
/// - **Execute** commands run silently without showing the window.
/// - **`InputResults`** commands emit a `command:activate` event and show the window.
fn register_command_shortcuts(app: &tauri::App, registry: &KitRegistry) {
    let entries = registry.commands_with_hotkeys();
    let handle = app.handle();

    if entries.is_empty() {
        tracing::info!("no command hotkeys to register");
        return;
    }

    for entry in entries {
        let hotkey = entry.hotkey.clone();
        let kit_id = entry.kit_id.clone();
        let command_id = entry.command_id.clone();
        let mode = entry.mode.clone();
        let name = entry.name.clone();
        let icon = entry.icon.clone();
        let log_cmd = command_id.clone();

        let result = handle.global_shortcut().on_shortcut(hotkey.as_str(), move |app, _, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            tracing::info!(
                kit = %kit_id, command = %command_id,
                "command hotkey triggered"
            );

            match mode {
                CommandMode::Execute => {
                    let registry_state = app.state::<KitRegistryState>();
                    let registry_arc = Arc::clone(&registry_state.0);
                    let kid = kit_id.clone();
                    let cid = command_id.clone();
                    tauri::async_runtime::spawn(async move {
                        let reg = registry_arc.read().await;
                        if let Err(e) = reg.execute_command(&kid, &cid).await {
                            tracing::warn!(
                                kit = %kid, command = %cid,
                                error = %e, "command hotkey execution failed"
                            );
                        }
                    });
                }
                CommandMode::InputResults => {
                    let payload = CommandActivatePayload {
                        kit_id: kit_id.clone(),
                        command_id: command_id.clone(),
                        name: name.clone(),
                        icon: icon.clone(),
                    };
                    let _ = app.emit("command:activate", payload);
                    let _ = window::show(app);
                }
            }
        });

        if let Err(e) = result {
            tracing::warn!(
                hotkey = %hotkey,
                "failed to register command shortcut: {e}"
            );
        } else {
            tracing::info!(hotkey = %hotkey, command = %log_cmd, "registered command hotkey");
        }
    }
}
