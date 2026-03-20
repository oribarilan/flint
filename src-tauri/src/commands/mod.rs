//! Tauri IPC commands for window management, file search, file opening,
//! and `OpenCode` chat.
//!
//! Commands are grouped by domain:
//! - [`chat`] — `OpenCode` chat session management
//! - [`window`] — overlay window visibility
//! - [`search`] — file and application search
//! - [`files`] — file open, reveal, delete, editor, icons
//! - [`config`] — application configuration and kit manifests
//!
//! `lib.rs` references commands via the submodule path (e.g.
//! `commands::chat::get_chat_status`) so that Tauri's `generate_handler!`
//! macro can locate the `__cmd__*` wrapper items it generates alongside each
//! `#[tauri::command]` function.

pub mod chat;
pub mod config;
pub mod files;
pub mod search;
pub mod window;
