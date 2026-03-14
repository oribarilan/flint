//! Flint — AI-native application launcher.
//!
//! This crate wires up the Tauri application: plugins, commands,
//! global hotkey, system tray, and background file indexing.

mod commands;
pub mod config;
mod error;
mod focus;
mod icons;
pub mod indexer;
pub mod kits;
pub mod providers;
pub mod search;
mod tray;
mod window;

use std::sync::{Arc, RwLock};

use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use error::StringResult;
use tracing_subscriber::EnvFilter;

use indexer::FileIndex;
use kits::{CommandMode, KitContextBase, KitIcon, KitRegistry, KitRegistryState};

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
pub fn run() {
    // Initialise structured logging; default to `info` if RUST_LOG is unset.
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = window::toggle(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::toggle_window,
            commands::show_window,
            commands::hide_window,
            commands::open_settings,
            commands::search_files,
            commands::search_all,
            commands::search_command,
            commands::execute_command,
            commands::open_file,
            commands::get_app_icon,
            commands::start_copilot_auth,
            commands::complete_copilot_auth,
            commands::get_auth_status,
            commands::send_chat_message,
            commands::sign_out,
            commands::get_config,
            commands::get_default_config,
            commands::update_config,
            commands::get_kit_manifests,
        ])
        .setup(|app| {
            // Load application config (or use defaults).
            let cfg = config::load_or_default();

            // Register main toggle hotkey from config.
            app.global_shortcut().register(cfg.general.hotkey.as_str()).str_err()?;

            // Build system tray icon + menu.
            tray::setup(app)?;

            // Initialise Copilot provider as managed state.
            let copilot = providers::copilot::CopilotProvider::new();
            app.manage(commands::CopilotProviderState(copilot));

            // Manage application config and extract search params for background indexing.
            let search_dirs = cfg.search.directories.clone();
            let search_exclude = cfg.search.exclude.clone();
            let search_depth = cfg.search.max_depth;
            let app_config = config::AppConfig::new(cfg);
            let kit_config = app_config.get();
            app.manage(app_config.clone());

            // Initialise kit registry and register built-in kits.
            let kit_ctx_base = KitContextBase {
                app: app.handle().clone(),
                config: app_config,
                http: reqwest::Client::new(),
                base_data_dir: config::config_base_dir().join("flint").join("kits"),
            };
            app.manage(kit_ctx_base);

            let mut registry = KitRegistry::new();
            registry.register(Box::new(kits::CalculatorKit::new()), &kit_config);

            // Register per-command global shortcuts.
            register_command_shortcuts(app, &registry);

            app.manage(KitRegistryState(Arc::new(tokio::sync::RwLock::new(registry))));

            // Initialise file index as managed state and populate in background.
            let index = Arc::new(RwLock::new(Vec::new()));
            app.manage(FileIndex(index.clone()));

            std::thread::spawn(move || {
                let entries =
                    indexer::build_index_with_config(&search_dirs, &search_exclude, search_depth);
                if let Ok(mut lock) = index.write() {
                    *lock = entries;
                }
            });

            Ok(())
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

    for entry in entries {
        let hotkey = entry.hotkey.clone();
        let kit_id = entry.kit_id.clone();
        let command_id = entry.command_id.clone();
        let mode = entry.mode.clone();
        let name = entry.name.clone();
        let icon = entry.icon.clone();

        let result = handle.global_shortcut().on_shortcut(hotkey.as_str(), move |app, _, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

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
        }
    }
}
