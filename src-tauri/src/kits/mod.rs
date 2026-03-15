//! Kit system — extensible tool architecture for Flint.
//!
//! Kits are self-contained capability modules that expose **commands** as
//! their primary primitive. A command is discoverable via search, can have
//! a prefix trigger, and optionally accepts sub-queries (`InputResults`) or
//! executes immediately (Execute).
//!
//! See `specs/kits.md` and `.todo/kit-v2.md` for the full specification.

mod calculator;
mod clipboard;
mod registry;
mod window_management;

pub use calculator::CalculatorKit;
pub use clipboard::ClipboardKit;
pub use registry::{
    CommandHotkeyEntry, CommandInfo, KitInfo, KitRegistry, KitRegistryState, KitState,
};
pub use window_management::WindowManagementKit;

use std::path::PathBuf;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Emitter;

use crate::config::AppConfig;

// ---------------------------------------------------------------------------
// Kit trait
// ---------------------------------------------------------------------------

/// A Kit is a self-contained capability module.
///
/// Kits expose commands — the primary unit of functionality. Each command is
/// discoverable via search and can optionally accept sub-queries or execute
/// immediately.
#[async_trait]
pub trait Kit: Send + Sync {
    /// Identity and metadata.
    fn manifest(&self) -> &KitManifest;

    /// Lifecycle: called lazily on first use.
    async fn init(&self, _ctx: &KitContext) -> Result<(), KitError> {
        Ok(())
    }

    /// Whether this kit is enabled by default when no config is present.
    ///
    /// Most kits default to enabled. Kits that access sensitive data (e.g.,
    /// clipboard) should return `false` — requiring the user to opt in.
    fn default_enabled(&self) -> bool {
        true
    }

    /// Whether this kit requires immediate initialization at startup.
    ///
    /// Kits that run background tasks (e.g., clipboard watcher) must return
    /// `true` so their `init()` is called during app setup rather than lazily
    /// on first user interaction.
    fn eager_init(&self) -> bool {
        false
    }

    /// Lifecycle: called on app shutdown for cleanup.
    async fn shutdown(&self) -> Result<(), KitError> {
        Ok(())
    }

    // ── Commands ────────────────────────────────────────────────

    /// The commands this kit provides.
    fn commands(&self) -> Vec<CommandDef>;

    /// Return results for a query within a specific command.
    ///
    /// Called on every keystroke when a command chip is active — must be
    /// fast (<10ms). Only called for `InputResults` mode commands.
    fn search(&self, _command_id: &str, _query: &str) -> Vec<KitResult> {
        vec![]
    }

    /// Execute a command immediately. Used for `Execute` mode commands.
    async fn execute(&self, command_id: &str) -> Result<CommandOutput, KitError> {
        Err(KitError::CommandNotFound(command_id.to_string()))
    }

    /// Handle a custom action dispatched from the frontend.
    ///
    /// The `action_id` is the `id` field from `KitAction::Custom`.
    /// Returns a message to show the user, or `None` for silent completion.
    async fn handle_custom_action(&self, action_id: &str) -> Result<Option<String>, KitError> {
        Err(KitError::Internal(format!("custom action not handled: {action_id}")))
    }

    // ── App Window (unchanged) ──────────────────────────────────

    /// Does this kit have a dedicated app view?
    fn app_window(&self) -> Option<&AppWindowConfig> {
        None
    }
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/// Kit metadata.
#[derive(Debug, Clone, Serialize)]
pub struct KitManifest {
    /// Unique identifier: `"calculator"`, `"stocks"`, `"clipboard"`.
    pub id: &'static str,
    /// Human-readable name: `"Calculator"`.
    pub name: &'static str,
    /// One-line description: `"Evaluate math expressions"`.
    pub description: &'static str,
    /// Icon for the kit in result lists and settings.
    pub icon: KitIcon,
}

/// Visual representation for a kit or individual result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum KitIcon {
    /// An emoji character: `"🧮"`, `"📋"`.
    Emoji(String),
    /// A named icon from the built-in icon set.
    Named(String),
    /// Inline data URI (e.g., base64 PNG for app icons).
    DataUri(String),
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Definition of a single command a kit provides.
#[derive(Debug, Clone, Serialize)]
pub struct CommandDef {
    /// Unique command identifier within the kit (e.g., `"calculate"`).
    pub id: &'static str,
    /// Human-readable name (e.g., `"Calculator"`).
    pub name: &'static str,
    /// One-line description (e.g., `"Evaluate math expressions"`).
    pub description: &'static str,
    /// Icon for this command in search results.
    pub icon: KitIcon,
    /// Whether this command takes input or executes immediately.
    pub mode: CommandMode,
    /// Optional prefix that auto-activates this command (e.g., `"="`).
    pub default_prefix: Option<&'static str>,
    /// Optional hotkey (e.g., `"CmdOrCtrl+="`). Wiring deferred.
    pub default_hotkey: Option<&'static str>,
}

/// How a command is activated.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CommandMode {
    /// Shows a chip in the search bar, accepts a sub-query, returns results.
    InputResults,
    /// Runs immediately when selected — no sub-search flow.
    Execute,
}

/// Result of executing an `Execute`-mode command.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum CommandOutput {
    /// Command completed silently.
    Done,
    /// Command completed with a notification/message.
    Message { text: String },
}

// ---------------------------------------------------------------------------
// Search result model
// ---------------------------------------------------------------------------

/// A single result from a kit's search.
#[derive(Debug, Clone, Serialize)]
pub struct KitResult {
    /// Unique within this kit.
    pub id: String,
    /// Primary display text.
    pub title: String,
    /// Secondary text (path, description).
    pub subtitle: Option<String>,
    /// Per-result icon override.
    pub icon: Option<KitIcon>,
    /// What kind of result this is.
    pub kind: ResultKind,
    /// Right-aligned metadata (badges, timestamps).
    pub accessories: Vec<Accessory>,
    /// What happens on Enter, Tab, etc.
    pub actions: Vec<KitAction>,
    /// Inline preview data.
    pub preview: Option<KitPreview>,
    /// Relevance score for ranking within the kit's results.
    pub score: Option<u32>,
}

/// Actions a kit result can trigger.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum KitAction {
    /// Copy text to clipboard.
    Copy {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    /// Open a file/URL with the system handler.
    Open { target: String },
    /// Focus a system window.
    FocusWindow { window_id: u64 },
    /// Open this kit's app window.
    OpenApp,
    /// Run a custom action handled by the kit.
    Custom {
        id: String,
        label: String,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        requires_confirmation: bool,
    },
    /// Paste text (write to clipboard + simulate Cmd+V).
    Paste { text: String },
    /// Activate a command by showing its chip in the search bar.
    ActivateCommand { kit_id: String, command_id: String },
    /// Show a file/directory in the OS file manager.
    RevealInFileManager { target: String },
    /// Copy a file/directory's absolute path to clipboard.
    CopyPath { path: String },
    /// Copy a file/directory's name to clipboard.
    CopyName { name: String },
    /// Move a file/directory to the OS trash.
    Delete { target: String },
    /// Open a file in the user's configured editor.
    OpenInEditor { target: String },
}

/// Right-side accessories on a result row.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum Accessory {
    /// Plain text accessory (e.g., `"2 min ago"`).
    Text { value: String },
    /// Colored badge.
    Badge { text: String, color: String },
    /// Small icon.
    Icon { icon: KitIcon },
}

/// Optional inline preview for richer results.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "content")]
pub enum KitPreview {
    /// Plain text preview.
    Text(String),
    /// Rendered markdown.
    Markdown(String),
    /// Raw HTML (sandboxed).
    Html(String),
}

// ---------------------------------------------------------------------------
// App window surface
// ---------------------------------------------------------------------------

/// Configuration for a kit's dedicated app window.
#[derive(Debug, Clone, Serialize)]
pub struct AppWindowConfig {
    /// Window title.
    pub title: String,
    /// Default width in pixels.
    pub width: u32,
    /// Default height in pixels.
    pub height: u32,
}

// ---------------------------------------------------------------------------
// Kit context (shared infrastructure)
// ---------------------------------------------------------------------------

/// Kit-scoped event emitter.
///
/// Wraps `AppHandle::emit` with per-kit event namespacing so kits can push
/// typed events to the frontend without collisions.
#[derive(Clone)]
pub struct KitEventEmitter {
    app: AppHandle,
    kit_id: String,
}

impl KitEventEmitter {
    /// Create an emitter scoped to the given kit.
    pub fn new(app: &AppHandle, kit_id: &str) -> Self {
        Self { app: app.clone(), kit_id: kit_id.to_string() }
    }

    /// Emit a typed event to the frontend, namespaced as `kit:{kit_id}:{event}`.
    pub fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) -> Result<(), KitError> {
        self.app
            .emit(&format!("kit:{}:{}", self.kit_id, event), payload)
            .map_err(|e: tauri::Error| KitError::Internal(e.to_string()))
    }
}

/// Shared resources available to all kits, created once at app startup.
///
/// `for_kit()` produces a scoped [`KitContext`] with kit-specific data dir,
/// event emitter, and task manager.
#[derive(Clone)]
pub struct KitContextBase {
    /// Tauri app handle for window management and events.
    pub app: AppHandle,
    /// Application config.
    pub config: AppConfig,
    /// Shared HTTP client with connection pooling.
    pub http: reqwest::Client,
    /// Base data directory (`~/.config/flint/kits/`).
    pub base_data_dir: PathBuf,
}

impl KitContextBase {
    /// Create a kit-scoped context.
    pub fn for_kit(&self, kit_id: &str) -> KitContext {
        let data_dir = self.base_data_dir.join(kit_id);
        KitContext {
            app: self.app.clone(),
            config: self.config.clone(),
            http: self.http.clone(),
            data_dir,
            events: KitEventEmitter::new(&self.app, kit_id),
        }
    }
}

/// Resources available to a specific kit during init and execution.
pub struct KitContext {
    /// Tauri app handle for window management.
    pub app: AppHandle,
    /// Application config.
    pub config: AppConfig,
    /// Shared HTTP client with connection pooling.
    pub http: reqwest::Client,
    /// Per-kit persistent storage (`~/.config/flint/kits/<id>/`).
    pub data_dir: PathBuf,
    /// Kit-scoped event emission to frontend.
    pub events: KitEventEmitter,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors that can occur in kit operations.
#[derive(Debug, thiserror::Error)]
pub enum KitError {
    #[error("command not found: {0}")]
    CommandNotFound(String),

    #[error("kit not found: {0}")]
    KitNotFound(String),

    #[error("kit init failed: {0}")]
    InitFailed(String),

    #[error("{0}")]
    Internal(String),
}

// ---------------------------------------------------------------------------
// Result kind
// ---------------------------------------------------------------------------

/// What kind of entity a search result represents.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum ResultKind {
    /// A system application.
    Application,
    /// A regular file.
    File,
    /// A directory.
    Directory,
    /// A kit command (discoverable in search).
    Command { kit_id: String, command_id: String, mode: CommandMode },
}

// ---------------------------------------------------------------------------
// IPC result type
// ---------------------------------------------------------------------------

/// Unified search result sent to the frontend via IPC.
///
/// Both core file search results and kit results are converted to this type,
/// enabling a single rendering pipeline.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KitSearchResult {
    /// `"core"` for file search, kit id otherwise.
    pub kit_id: String,
    /// Human-readable kit name (e.g., `"Calculator"`). `None` for core results.
    pub kit_name: Option<String>,
    /// Unique within the kit.
    pub id: String,
    /// Primary display text.
    pub title: String,
    /// Secondary text (path, description).
    pub subtitle: Option<String>,
    /// Result icon.
    pub icon: Option<KitIcon>,
    /// What kind of result this is.
    pub kind: ResultKind,
    /// Right-aligned metadata.
    pub accessories: Vec<Accessory>,
    /// Ordered action list. First action = default (Enter).
    pub actions: Vec<KitAction>,
    /// Inline preview data.
    pub preview: Option<KitPreview>,
    /// Relevance score.
    pub score: Option<u32>,
}

impl KitSearchResult {
    /// Convert a [`KitResult`] from a specific kit into the IPC type.
    pub fn from_kit_result(kit_id: &str, kit_name: &str, result: KitResult) -> Self {
        Self {
            kit_id: kit_id.to_string(),
            kit_name: Some(kit_name.to_string()),
            id: result.id,
            title: result.title,
            subtitle: result.subtitle,
            icon: result.icon,
            kind: result.kind,
            accessories: result.accessories,
            actions: result.actions,
            preview: result.preview,
            score: result.score,
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── CommandMode serialization ───────────────────────────────

    #[test]
    fn command_mode_serializes_to_string() {
        let json = serde_json::to_string(&CommandMode::InputResults).unwrap();
        assert_eq!(json, r#""InputResults""#);

        let json = serde_json::to_string(&CommandMode::Execute).unwrap();
        assert_eq!(json, r#""Execute""#);
    }

    #[test]
    fn command_mode_round_trips() {
        let mode = CommandMode::InputResults;
        let json = serde_json::to_string(&mode).unwrap();
        let back: CommandMode = serde_json::from_str(&json).unwrap();
        assert_eq!(back, mode);
    }

    // ── ResultKind serialization ────────────────────────────────

    #[test]
    fn result_kind_file_serializes_correctly() {
        let kind = ResultKind::File;
        let json = serde_json::to_value(&kind).unwrap();
        assert_eq!(json["type"], "File");
    }

    #[test]
    fn result_kind_command_serializes_with_fields() {
        let kind = ResultKind::Command {
            kit_id: "calculator".to_string(),
            command_id: "calculate".to_string(),
            mode: CommandMode::InputResults,
        };
        let json = serde_json::to_value(&kind).unwrap();
        assert_eq!(json["type"], "Command");
        assert_eq!(json["kit_id"], "calculator");
        assert_eq!(json["command_id"], "calculate");
        assert_eq!(json["mode"], "InputResults");
    }

    #[test]
    fn result_kind_round_trips() {
        let kind = ResultKind::Command {
            kit_id: "calc".to_string(),
            command_id: "eval".to_string(),
            mode: CommandMode::Execute,
        };
        let json = serde_json::to_string(&kind).unwrap();
        let back: ResultKind = serde_json::from_str(&json).unwrap();
        assert_eq!(back, kind);
    }

    // ── CommandOutput serialization ─────────────────────────────

    #[test]
    fn command_output_done_serializes() {
        let json = serde_json::to_value(&CommandOutput::Done).unwrap();
        assert_eq!(json["type"], "Done");
    }

    #[test]
    fn command_output_message_serializes() {
        let output = CommandOutput::Message { text: "Cleared!".to_string() };
        let json = serde_json::to_value(&output).unwrap();
        assert_eq!(json["type"], "Message");
        assert_eq!(json["text"], "Cleared!");
    }

    // ── KitAction::ActivateCommand serialization ────────────────

    #[test]
    fn activate_command_serializes_correctly() {
        let action = KitAction::ActivateCommand {
            kit_id: "calculator".to_string(),
            command_id: "calculate".to_string(),
        };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "ActivateCommand");
        assert_eq!(json["kit_id"], "calculator");
        assert_eq!(json["command_id"], "calculate");
    }

    // ── CommandDef ──────────────────────────────────────────────

    #[test]
    fn command_def_serializes_with_all_fields() {
        let def = CommandDef {
            id: "calculate",
            name: "Calculator",
            description: "Evaluate math expressions",
            icon: KitIcon::Emoji("🧮".to_string()),
            mode: CommandMode::InputResults,
            default_prefix: Some("="),
            default_hotkey: None,
        };
        let json = serde_json::to_value(&def).unwrap();
        assert_eq!(json["id"], "calculate");
        assert_eq!(json["name"], "Calculator");
        assert_eq!(json["mode"], "InputResults");
        assert_eq!(json["default_prefix"], "=");
        assert!(json["default_hotkey"].is_null());
    }

    // ── New KitAction variants serialization ────────────────────

    #[test]
    fn reveal_in_file_manager_serializes() {
        let action = KitAction::RevealInFileManager { target: "/tmp/file.txt".to_string() };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "RevealInFileManager");
        assert_eq!(json["target"], "/tmp/file.txt");
    }

    #[test]
    fn copy_path_serializes() {
        let action = KitAction::CopyPath { path: "/tmp/file.txt".to_string() };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "CopyPath");
        assert_eq!(json["path"], "/tmp/file.txt");
    }

    #[test]
    fn copy_name_serializes() {
        let action = KitAction::CopyName { name: "file.txt".to_string() };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "CopyName");
        assert_eq!(json["name"], "file.txt");
    }

    #[test]
    fn delete_serializes() {
        let action = KitAction::Delete { target: "/tmp/file.txt".to_string() };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "Delete");
        assert_eq!(json["target"], "/tmp/file.txt");
    }

    #[test]
    fn open_in_editor_serializes() {
        let action = KitAction::OpenInEditor { target: "/tmp/file.txt".to_string() };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "OpenInEditor");
        assert_eq!(json["target"], "/tmp/file.txt");
    }

    #[test]
    fn custom_action_with_confirmation_serializes() {
        let action = KitAction::Custom {
            id: "pin".to_string(),
            label: "Pin".to_string(),
            requires_confirmation: false,
        };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["type"], "Custom");
        assert_eq!(json["id"], "pin");
        // requires_confirmation=false is skipped via skip_serializing_if
        assert!(json.get("requires_confirmation").is_none());
    }

    #[test]
    fn custom_action_with_confirmation_true_serializes() {
        let action = KitAction::Custom {
            id: "delete-all".to_string(),
            label: "Delete All".to_string(),
            requires_confirmation: true,
        };
        let json = serde_json::to_value(&action).unwrap();
        assert_eq!(json["requires_confirmation"], true);
    }

    #[test]
    fn new_action_variants_round_trip() {
        let actions = vec![
            KitAction::RevealInFileManager { target: "/tmp".to_string() },
            KitAction::CopyPath { path: "/tmp/x".to_string() },
            KitAction::CopyName { name: "x".to_string() },
            KitAction::Delete { target: "/tmp/x".to_string() },
            KitAction::OpenInEditor { target: "/tmp/x.rs".to_string() },
        ];
        for action in actions {
            let json = serde_json::to_string(&action).unwrap();
            let back: KitAction = serde_json::from_str(&json).unwrap();
            assert_eq!(
                serde_json::to_value(&back).unwrap(),
                serde_json::to_value(&action).unwrap()
            );
        }
    }
}
