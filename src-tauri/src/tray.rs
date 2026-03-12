//! System tray setup and menu event handling.

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App,
};

use crate::error::StringResult;
use crate::window;

/// Build the system tray icon and attach a menu with event handlers.
pub fn setup(app: &App) -> Result<(), String> {
    let show = MenuItemBuilder::with_id("show", "Show Flint").build(app).str_err()?;

    let sep1 = PredefinedMenuItem::separator(app).str_err()?;

    let settings = MenuItemBuilder::with_id("settings", "Settings...").build(app).str_err()?;

    let sign_in = MenuItemBuilder::with_id("sign_in", "Sign In").build(app).str_err()?;

    let sep2 = PredefinedMenuItem::separator(app).str_err()?;

    let quit = MenuItemBuilder::with_id("quit", "Quit Flint").build(app).str_err()?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &sep1, &settings, &sign_in, &sep2, &quit])
        .build()
        .str_err()?;

    let icon = Image::from_path("icons/icon.png").str_err()?;

    TrayIconBuilder::new()
        .icon(icon.clone())
        .icon_as_template(true)
        .tooltip("Flint")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(handle_menu_event)
        .build(app)
        .str_err()?;

    Ok(())
}

/// Dispatch tray menu events to the appropriate handler.
#[allow(clippy::needless_pass_by_value)] // Signature required by Tauri callback
fn handle_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "show" => {
            let _ = window::show(app);
        }
        "quit" => {
            app.exit(0);
        }
        // "settings" and "sign_in" will be handled in future phases.
        _ => {}
    }
}
