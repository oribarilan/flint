//! Kit system — extensible tool architecture for Flint.
//!
//! Kits are self-contained capability modules that surface functionality
//! through up to four surfaces: search, chat tools, app windows, and
//! global shortcuts. File search is core to Flint, not a kit.
//!
//! See `specs/kits.md` for the full specification.

mod registry;

pub use registry::{KitRegistry, KitRegistryState, KitState};

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
/// Implement only the surfaces your kit needs — all have default no-op impls.
#[async_trait]
pub trait Kit: Send + Sync {
    /// Identity and metadata.
    fn manifest(&self) -> &KitManifest;

    /// Lifecycle: called lazily on first use.
    async fn init(&self, _ctx: &KitContext) -> Result<(), KitError> {
        Ok(())
    }

    /// Lifecycle: called on app shutdown for cleanup.
    async fn shutdown(&self) -> Result<(), KitError> {
        Ok(())
    }

    // ── Surface 1: Search ──────────────────────────────────────

    /// How the user activates this kit in search. Returns `None` if the kit
    /// has no search surface (chat-only or shortcut-only).
    fn search_trigger(&self) -> Option<&SearchTrigger> {
        None
    }

    /// Return results for the given query. Called on every keystroke when the
    /// trigger matches — must be fast (<10ms).
    ///
    /// The query has already been stripped of the prefix/keyword.
    fn search(&self, _query: &str) -> Vec<KitResult> {
        vec![]
    }

    // ── Surface 2: Chat Tools ──────────────────────────────────

    /// OpenAI-compatible function definitions for the AI to call.
    fn chat_tools(&self) -> Vec<ChatToolDef> {
        vec![]
    }

    /// Execute a chat tool call.
    async fn invoke_chat_tool(
        &self,
        tool_name: &str,
        _args: serde_json::Value,
    ) -> Result<serde_json::Value, KitError> {
        Err(KitError::ToolNotFound(tool_name.to_string()))
    }

    // ── Surface 3: App Window ──────────────────────────────────

    /// Does this kit have a dedicated app view?
    fn app_window(&self) -> Option<&AppWindowConfig> {
        None
    }

    // ── Surface 4: Global Shortcuts ────────────────────────────

    /// Shortcuts this kit wants to register.
    fn shortcuts(&self) -> Vec<KitShortcut> {
        vec![]
    }

    /// Handle a shortcut press. Returns an action to execute.
    async fn handle_shortcut(&self, shortcut_id: &str) -> Result<ShortcutAction, KitError> {
        Err(KitError::ShortcutNotFound(shortcut_id.to_string()))
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
// Search surface
// ---------------------------------------------------------------------------

/// When a kit should activate during search.
///
/// Kits are always explicit — the user types a prefix or keyword to invoke them.
#[derive(Debug, Clone)]
pub enum SearchTrigger {
    /// Activates when query starts with prefix character(s): `"= 2+3"`, `"$ AAPL"`.
    /// The prefix is stripped before passing to `search()`.
    Prefix(&'static str),
    /// Activates when query starts with a keyword followed by a space: `"weather SF"`.
    /// The keyword is stripped before passing to `search()`.
    Keyword(&'static str),
}

impl SearchTrigger {
    /// Check whether `query` matches this trigger.
    pub fn matches(&self, query: &str) -> bool {
        match self {
            Self::Prefix(p) => query.starts_with(p),
            Self::Keyword(kw) => {
                query.strip_prefix(kw).is_some_and(|rest| rest.is_empty() || rest.starts_with(' '))
            }
        }
    }

    /// Strip the prefix/keyword from the query, returning the effective query
    /// the kit should search over.
    pub fn strip<'a>(&self, query: &'a str) -> &'a str {
        match self {
            Self::Prefix(p) => &query[p.len()..],
            Self::Keyword(kw) => {
                if query.len() > kw.len() {
                    // Skip keyword + space
                    &query[kw.len() + 1..]
                } else {
                    ""
                }
            }
        }
    }
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
    Custom { id: String, label: String },
    /// Paste text (write to clipboard + simulate Cmd+V).
    Paste { text: String },
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
// Chat surface
// ---------------------------------------------------------------------------

/// Chat tool definition (OpenAI-compatible function calling format).
#[derive(Debug, Clone, Serialize)]
pub struct ChatToolDef {
    /// Function name (e.g., `"calculate"`, `"get_stock_price"`).
    pub name: String,
    /// What it does (for the model).
    pub description: String,
    /// JSON Schema for the function arguments.
    pub parameters: serde_json::Value,
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
// Shortcut surface
// ---------------------------------------------------------------------------

/// A global keyboard shortcut a kit wants to register.
#[derive(Debug, Clone, Serialize)]
pub struct KitShortcut {
    /// Shortcut identifier (e.g., `"clipboard-history"`).
    pub id: String,
    /// Default key combination (e.g., `"CmdOrCtrl+Shift+V"`).
    pub default_key: String,
    /// Human description (e.g., `"Show clipboard history"`).
    pub description: String,
}

/// Action to execute when a kit shortcut fires.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ShortcutAction {
    /// Open Flint with a pre-filled query.
    ShowOverlayWithQuery { query: String },
    /// Open Flint filtered to a specific kit's results.
    ShowOverlayWithKit { kit_id: String },
    /// Open the kit's dedicated app window.
    OpenAppWindow { kit_id: String },
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
    #[error("tool not found: {0}")]
    ToolNotFound(String),

    #[error("kit not found: {0}")]
    KitNotFound(String),

    #[error("shortcut not found: {0}")]
    ShortcutNotFound(String),

    #[error("kit init failed: {0}")]
    InitFailed(String),

    #[error("{0}")]
    Internal(String),
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
    /// Unique within the kit.
    pub id: String,
    /// Primary display text.
    pub title: String,
    /// Secondary text (path, description).
    pub subtitle: Option<String>,
    /// Result icon.
    pub icon: Option<KitIcon>,
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
    pub fn from_kit_result(kit_id: &str, result: KitResult) -> Self {
        Self {
            kit_id: kit_id.to_string(),
            id: result.id,
            title: result.title,
            subtitle: result.subtitle,
            icon: result.icon,
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

    // ── SearchTrigger::matches ──────────────────────────────────

    #[test]
    fn prefix_matches_when_query_starts_with_prefix() {
        let trigger = SearchTrigger::Prefix("=");
        assert!(trigger.matches("= 2+3"));
        assert!(trigger.matches("=2+3"));
        assert!(trigger.matches("="));
    }

    #[test]
    fn prefix_does_not_match_unrelated_query() {
        let trigger = SearchTrigger::Prefix("=");
        assert!(!trigger.matches("hello"));
        assert!(!trigger.matches(""));
        assert!(!trigger.matches(" ="));
    }

    #[test]
    fn prefix_matches_multi_char_prefix() {
        let trigger = SearchTrigger::Prefix("$$");
        assert!(trigger.matches("$$ something"));
        assert!(!trigger.matches("$ something"));
    }

    #[test]
    fn keyword_matches_keyword_followed_by_space() {
        let trigger = SearchTrigger::Keyword("weather");
        assert!(trigger.matches("weather SF"));
        assert!(trigger.matches("weather "));
    }

    #[test]
    fn keyword_matches_bare_keyword() {
        let trigger = SearchTrigger::Keyword("weather");
        assert!(trigger.matches("weather"));
    }

    #[test]
    fn keyword_does_not_match_partial_or_substring() {
        let trigger = SearchTrigger::Keyword("weather");
        assert!(!trigger.matches("weathe"));
        assert!(!trigger.matches("weatherman"));
        assert!(!trigger.matches(""));
    }

    // ── SearchTrigger::strip ────────────────────────────────────

    #[test]
    fn prefix_strip_removes_prefix() {
        let trigger = SearchTrigger::Prefix("= ");
        assert_eq!(trigger.strip("= 2+3"), "2+3");
    }

    #[test]
    fn prefix_strip_single_char() {
        let trigger = SearchTrigger::Prefix("=");
        assert_eq!(trigger.strip("=2+3"), "2+3");
        assert_eq!(trigger.strip("="), "");
    }

    #[test]
    fn keyword_strip_removes_keyword_and_space() {
        let trigger = SearchTrigger::Keyword("weather");
        assert_eq!(trigger.strip("weather SF"), "SF");
        assert_eq!(trigger.strip("weather "), "");
    }

    #[test]
    fn keyword_strip_bare_keyword_returns_empty() {
        let trigger = SearchTrigger::Keyword("weather");
        assert_eq!(trigger.strip("weather"), "");
    }
}
