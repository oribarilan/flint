//! Flint — AI-native application launcher.
//!
//! This crate wires up the Tauri application: plugins, commands,
//! global hotkey, system tray, and background file indexing.

mod commands;
mod error;
mod icons;
pub mod indexer;
pub mod providers;
pub mod search;
mod tray;
mod window;

use std::sync::{Arc, RwLock};

use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use error::StringResult;
use tracing_subscriber::EnvFilter;

use indexer::FileIndex;

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
        .invoke_handler(tauri::generate_handler![
            commands::toggle_window,
            commands::show_window,
            commands::hide_window,
            commands::open_settings,
            commands::search_files,
            commands::open_file,
            commands::get_app_icon,
            commands::start_copilot_auth,
            commands::complete_copilot_auth,
            commands::get_auth_status,
            commands::send_chat_message,
            commands::sign_out,
        ])
        .setup(|app| {
            // Register global hotkey (CmdOrCtrl+Shift+Space).
            app.global_shortcut().register("CmdOrCtrl+Shift+Space").str_err()?;

            // Build system tray icon + menu.
            tray::setup(app)?;

            // Initialise Copilot provider as managed state.
            let copilot = providers::copilot::CopilotProvider::new();
            app.manage(commands::CopilotProviderState(copilot));

            // Initialise file index as managed state and populate in background.
            let index = Arc::new(RwLock::new(Vec::new()));
            app.manage(FileIndex(index.clone()));

            std::thread::spawn(move || {
                let entries = indexer::build_index();
                if let Ok(mut lock) = index.write() {
                    *lock = entries;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
