//! Clipboard kit — track clipboard history with search, pin, and delete.
//!
//! Disabled by default. When enabled, a background watcher captures text
//! clipboard changes and stores them in a file-backed in-memory store.
//! Users search history via the `history` chip command and manage entries
//! via the Action Panel.

mod privacy;
mod store;
mod watcher;

use std::sync::Arc;

use async_trait::async_trait;
use nucleo::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo::{Matcher, Utf32Str};
use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::{
    Accessory, CommandDef, CommandMode, CommandOutput, Kit, KitAction, KitContext, KitError,
    KitIcon, KitManifest, KitResult, ResultKind,
};
use store::ClipboardStore;
use watcher::WatcherConfig;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// SVG icon: clipboard with list lines.
const ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="16" rx="2"/><line x1="7" y1="7" x2="13" y2="7"/><line x1="7" y1="10" x2="13" y2="10"/><line x1="7" y1="13" x2="10" y2="13"/></svg>"#;

/// Command IDs.
const CMD_HISTORY: &str = "history";
const CMD_CLEAR: &str = "clear";

/// Default configuration values.
const DEFAULT_MAX_HISTORY: usize = 200;
const DEFAULT_RETENTION_DAYS: u32 = 7;
const DEFAULT_POLL_INTERVAL_MS: u64 = 500;

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

/// Clipboard kit configuration, extracted from the `extra` `HashMap`.
#[derive(Debug, Clone)]
pub struct ClipboardConfig {
    max_history: usize,
    retention_days: u32,
    poll_interval_ms: u64,
    sensitive_detection: bool,
    excluded_apps: Vec<String>,
}

impl ClipboardConfig {
    /// Parse config from the kit's `extra` settings in `FlintConfig`.
    fn from_kit_extra(extra: &std::collections::HashMap<String, toml::Value>) -> Self {
        let max_history = extra
            .get("max_history")
            .and_then(toml::Value::as_integer)
            .and_then(|v| usize::try_from(v).ok())
            .unwrap_or(DEFAULT_MAX_HISTORY);

        let retention_days = extra
            .get("retention_days")
            .and_then(toml::Value::as_integer)
            .and_then(|v| u32::try_from(v).ok())
            .unwrap_or(DEFAULT_RETENTION_DAYS);

        let poll_interval_ms = extra
            .get("poll_interval_ms")
            .and_then(toml::Value::as_integer)
            .and_then(|v| u64::try_from(v).ok())
            .unwrap_or(DEFAULT_POLL_INTERVAL_MS);

        let sensitive_detection =
            extra.get("sensitive_detection").and_then(toml::Value::as_bool).unwrap_or(true);

        let excluded_apps = extra
            .get("excluded_apps")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();

        Self { max_history, retention_days, poll_interval_ms, sensitive_detection, excluded_apps }
    }
}

impl Default for ClipboardConfig {
    fn default() -> Self {
        Self {
            max_history: DEFAULT_MAX_HISTORY,
            retention_days: DEFAULT_RETENTION_DAYS,
            poll_interval_ms: DEFAULT_POLL_INTERVAL_MS,
            sensitive_detection: true,
            excluded_apps: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Kit implementation
// ---------------------------------------------------------------------------

/// Clipboard history management kit.
pub struct ClipboardKit {
    manifest: KitManifest,
    /// Shared clipboard store, accessible from both the kit and the watcher.
    store: Arc<RwLock<ClipboardStore>>,
    /// Resolved configuration.
    config: ClipboardConfig,
    /// Handle to abort the watcher background task on shutdown.
    watcher_handle: std::sync::Mutex<Option<AbortHandle>>,
}

impl ClipboardKit {
    /// Create a new clipboard kit with configuration from the app config.
    pub fn new(config: &crate::config::FlintConfig) -> Self {
        let kit_config = config
            .kits
            .get("clipboard")
            .map(|kc| ClipboardConfig::from_kit_extra(&kc.extra))
            .unwrap_or_default();

        Self {
            manifest: KitManifest {
                id: "clipboard",
                name: "Clipboard History",
                description: "Search and manage clipboard history",
                icon: Self::icon(),
            },
            store: Arc::new(RwLock::new(ClipboardStore::empty())),
            config: kit_config,
            watcher_handle: std::sync::Mutex::new(None),
        }
    }

    fn icon() -> KitIcon {
        KitIcon::DataUri(format!("data:image/svg+xml,{}", urlencoding::encode(ICON_SVG)))
    }

    /// Format a timestamp as a human-readable "time ago" string.
    fn time_ago(timestamp: chrono::DateTime<chrono::Utc>) -> String {
        let delta = chrono::Utc::now() - timestamp;

        if delta.num_seconds() < 60 {
            return "just now".to_string();
        }
        if delta.num_minutes() < 60 {
            let m = delta.num_minutes();
            return if m == 1 { "1 min ago".to_string() } else { format!("{m} min ago") };
        }
        if delta.num_hours() < 24 {
            let h = delta.num_hours();
            return if h == 1 { "1 hr ago".to_string() } else { format!("{h} hr ago") };
        }
        let d = delta.num_days();
        if d == 1 {
            "1 day ago".to_string()
        } else {
            format!("{d} days ago")
        }
    }

    /// Convert a store entry to a kit search result.
    fn entry_to_result(entry: &store::ClipboardEntry) -> KitResult {
        let mut accessories = vec![Accessory::Text { value: Self::time_ago(entry.timestamp) }];

        if entry.pinned {
            accessories.insert(0, Accessory::Icon { icon: KitIcon::Emoji("📌".to_string()) });
        }

        let actions = if entry.redacted {
            // Redacted entries: no copy, only delete.
            vec![KitAction::Custom {
                id: format!("delete:{}", entry.id),
                label: "Delete".to_string(),
                requires_confirmation: true,
            }]
        } else {
            let pin_label = if entry.pinned { "Unpin".to_string() } else { "Pin".to_string() };
            vec![
                KitAction::Copy { text: entry.full_content.clone(), label: None },
                KitAction::Custom {
                    id: format!("toggle_pin:{}", entry.id),
                    label: pin_label,
                    requires_confirmation: false,
                },
                KitAction::Custom {
                    id: format!("delete:{}", entry.id),
                    label: "Delete".to_string(),
                    requires_confirmation: true,
                },
            ]
        };

        let subtitle =
            entry.source_app.as_ref().map_or_else(String::new, |app| format!("from {app}"));

        KitResult {
            id: format!("clip-{}", entry.id),
            title: entry.preview.clone(),
            subtitle: if subtitle.is_empty() { None } else { Some(subtitle) },
            icon: if entry.redacted {
                Some(KitIcon::Emoji("🔒".to_string()))
            } else {
                Some(Self::icon())
            },
            kind: ResultKind::File,
            accessories,
            actions,
            preview: None,
            score: None,
        }
    }
}

#[async_trait]
impl Kit for ClipboardKit {
    fn manifest(&self) -> &KitManifest {
        &self.manifest
    }

    fn default_enabled(&self) -> bool {
        false
    }

    fn eager_init(&self) -> bool {
        true
    }

    async fn init(&self, ctx: &KitContext) -> Result<(), KitError> {
        // Load store from disk.
        let loaded = ClipboardStore::load(
            &ctx.data_dir,
            self.config.max_history,
            self.config.retention_days,
        );
        {
            let mut store_guard = self.store.write().await;
            *store_guard = loaded;
        }

        // Spawn the clipboard watcher background task.
        let watcher_config = WatcherConfig {
            poll_interval_ms: self.config.poll_interval_ms,
            excluded_apps: self.config.excluded_apps.clone(),
            sensitive_detection: self.config.sensitive_detection,
        };
        let store_clone = Arc::clone(&self.store);
        let handle = tokio::spawn(async move {
            watcher::run(store_clone, watcher_config).await;
        });
        if let Ok(mut guard) = self.watcher_handle.lock() {
            *guard = Some(handle.abort_handle());
        }

        tracing::info!("clipboard kit initialized");
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), KitError> {
        if let Ok(mut guard) = self.watcher_handle.lock() {
            if let Some(handle) = guard.take() {
                handle.abort();
            }
        }
        tracing::info!("clipboard kit shut down");
        Ok(())
    }

    fn commands(&self) -> Vec<CommandDef> {
        vec![
            CommandDef {
                id: CMD_HISTORY,
                name: "Clipboard History",
                description: "Search clipboard history",
                icon: Self::icon(),
                mode: CommandMode::InputResults,
                default_prefix: None,
                default_hotkey: None,
            },
            CommandDef {
                id: CMD_CLEAR,
                name: "Clear Clipboard History",
                description: "Delete all non-pinned clipboard entries",
                icon: Self::icon(),
                mode: CommandMode::Execute,
                default_prefix: None,
                default_hotkey: None,
            },
        ]
    }

    #[allow(clippy::significant_drop_tightening)] // guard must be held during search
    fn search(&self, command_id: &str, query: &str) -> Vec<KitResult> {
        if command_id != CMD_HISTORY {
            return vec![];
        }

        // We need blocking access to the store. Since `search` is sync and
        // called on every keystroke, use `try_read` to avoid blocking.
        let Ok(store_guard) = self.store.try_read() else { return vec![] };

        let trimmed = query.trim();
        if trimmed.is_empty() {
            // Empty query: pinned first, then most recent.
            return store_guard
                .all_sorted()
                .into_iter()
                .take(20)
                .map(Self::entry_to_result)
                .collect();
        }

        // Fuzzy search with nucleo.
        let pattern =
            Pattern::new(trimmed, CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
        let mut buf = Vec::new();

        let mut scored: Vec<(u32, &store::ClipboardEntry)> = store_guard
            .all_sorted()
            .into_iter()
            .filter_map(|entry| {
                let preview_lower = entry.preview.to_lowercase();
                let haystack = Utf32Str::new(&preview_lower, &mut buf);
                let score = pattern.score(haystack, &mut matcher)?;
                // Boost pinned entries.
                let boosted = if entry.pinned { score.saturating_add(50) } else { score };
                Some((boosted, entry))
            })
            .collect();

        scored.sort_by(|a, b| b.0.cmp(&a.0));

        scored
            .into_iter()
            .take(20)
            .map(|(score, entry)| {
                let mut result = Self::entry_to_result(entry);
                result.score = Some(score);
                result
            })
            .collect()
    }

    async fn execute(&self, command_id: &str) -> Result<CommandOutput, KitError> {
        if command_id != CMD_CLEAR {
            return Err(KitError::CommandNotFound(command_id.to_string()));
        }

        let removed = self.store.write().await.clear_non_pinned();
        tracing::info!(removed, "cleared non-pinned clipboard entries");

        Ok(CommandOutput::Message { text: format!("Cleared {removed} clipboard entries") })
    }

    async fn handle_custom_action(&self, action_id: &str) -> Result<Option<String>, KitError> {
        // Action IDs are formatted as "toggle_pin:{id}" or "delete:{id}".
        let (action, id_str) = action_id
            .split_once(':')
            .ok_or_else(|| KitError::Internal(format!("invalid action id: {action_id}")))?;

        let entry_id: u64 = id_str
            .parse()
            .map_err(|_| KitError::Internal(format!("invalid entry id: {id_str}")))?;

        match action {
            "toggle_pin" => {
                let mut store_guard = self.store.write().await;
                match store_guard.toggle_pin(entry_id) {
                    Some(true) => Ok(Some("Pinned".to_string())),
                    Some(false) => Ok(Some("Unpinned".to_string())),
                    None => Err(KitError::Internal("entry not found".to_string())),
                }
            }
            "delete" => {
                let mut store_guard = self.store.write().await;
                if store_guard.delete(entry_id) {
                    Ok(None)
                } else {
                    Err(KitError::Internal("entry not found".to_string()))
                }
            }
            _ => Err(KitError::Internal(format!("unknown clipboard action: {action}"))),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> crate::config::FlintConfig {
        crate::config::FlintConfig::default()
    }

    #[test]
    fn should_create_kit_with_default_config() {
        let kit = ClipboardKit::new(&default_config());
        assert_eq!(kit.manifest().id, "clipboard");
        assert_eq!(kit.manifest().name, "Clipboard History");
        assert_eq!(kit.config.max_history, DEFAULT_MAX_HISTORY);
        assert_eq!(kit.config.retention_days, DEFAULT_RETENTION_DAYS);
    }

    #[test]
    fn should_parse_custom_config() {
        let mut cfg = default_config();
        let mut extra = std::collections::HashMap::new();
        extra.insert("max_history".to_string(), toml::Value::Integer(50));
        extra.insert("retention_days".to_string(), toml::Value::Integer(14));
        extra.insert("sensitive_detection".to_string(), toml::Value::Boolean(false));
        extra.insert("poll_interval_ms".to_string(), toml::Value::Integer(250));
        extra.insert(
            "excluded_apps".to_string(),
            toml::Value::Array(vec![
                toml::Value::String("1Password".to_string()),
                toml::Value::String("Bitwarden".to_string()),
            ]),
        );
        cfg.kits.insert(
            "clipboard".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: std::collections::HashMap::new(),
                extra,
            },
        );

        let kit = ClipboardKit::new(&cfg);
        assert_eq!(kit.config.max_history, 50);
        assert_eq!(kit.config.retention_days, 14);
        assert!(!kit.config.sensitive_detection);
        assert_eq!(kit.config.poll_interval_ms, 250);
        assert_eq!(kit.config.excluded_apps, vec!["1Password", "Bitwarden"]);
    }

    #[test]
    fn should_expose_two_commands() {
        let kit = ClipboardKit::new(&default_config());
        let cmds = kit.commands();
        assert_eq!(cmds.len(), 2);

        let history = &cmds[0];
        assert_eq!(history.id, "history");
        assert_eq!(history.mode, CommandMode::InputResults);
        assert!(history.default_prefix.is_none());

        let clear = &cmds[1];
        assert_eq!(clear.id, "clear");
        assert_eq!(clear.mode, CommandMode::Execute);
    }

    #[test]
    fn should_return_empty_for_unknown_command() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.search("nonexistent", "query").is_empty());
    }

    #[test]
    fn search_returns_empty_when_store_is_empty() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.search(CMD_HISTORY, "").is_empty());
        assert!(kit.search(CMD_HISTORY, "something").is_empty());
    }

    #[test]
    fn time_ago_formats_correctly() {
        use chrono::Duration;

        let now = chrono::Utc::now();
        assert_eq!(ClipboardKit::time_ago(now), "just now");
        assert_eq!(ClipboardKit::time_ago(now - Duration::minutes(5)), "5 min ago");
        assert_eq!(ClipboardKit::time_ago(now - Duration::minutes(1)), "1 min ago");
        assert_eq!(ClipboardKit::time_ago(now - Duration::hours(3)), "3 hr ago");
        assert_eq!(ClipboardKit::time_ago(now - Duration::hours(1)), "1 hr ago");
        assert_eq!(ClipboardKit::time_ago(now - Duration::days(2)), "2 days ago");
        assert_eq!(ClipboardKit::time_ago(now - Duration::days(1)), "1 day ago");
    }

    #[test]
    fn entry_to_result_maps_regular_entry() {
        let entry = store::ClipboardEntry {
            id: 42,
            content_hash: 12345,
            preview: "hello world".to_string(),
            full_content: "hello world".to_string(),
            source_app: Some("VS Code".to_string()),
            timestamp: chrono::Utc::now(),
            pinned: false,
            redacted: false,
        };

        let result = ClipboardKit::entry_to_result(&entry);
        assert_eq!(result.id, "clip-42");
        assert_eq!(result.title, "hello world");
        assert_eq!(result.subtitle.as_deref(), Some("from VS Code"));
        assert_eq!(result.actions.len(), 3); // Copy, Pin, Delete
    }

    #[test]
    fn entry_to_result_maps_pinned_entry() {
        let entry = store::ClipboardEntry {
            id: 1,
            content_hash: 111,
            preview: "pinned item".to_string(),
            full_content: "pinned item".to_string(),
            source_app: None,
            timestamp: chrono::Utc::now(),
            pinned: true,
            redacted: false,
        };

        let result = ClipboardKit::entry_to_result(&entry);
        // Should have pin icon accessory.
        assert!(result.accessories.iter().any(|a| matches!(a, Accessory::Icon { .. })));
        // Pin action should say "Unpin".
        let has_unpin = result
            .actions
            .iter()
            .any(|a| matches!(a, KitAction::Custom { label, .. } if label == "Unpin"));
        assert!(has_unpin);
    }

    #[test]
    fn entry_to_result_maps_redacted_entry() {
        let entry = store::ClipboardEntry {
            id: 2,
            content_hash: 0,
            preview: "🔒 Sensitive content filtered".to_string(),
            full_content: String::new(),
            source_app: Some("1Password".to_string()),
            timestamp: chrono::Utc::now(),
            pinned: false,
            redacted: true,
        };

        let result = ClipboardKit::entry_to_result(&entry);
        // Redacted: only delete action, no copy.
        assert_eq!(result.actions.len(), 1);
        assert!(matches!(&result.actions[0], KitAction::Custom { label, .. } if label == "Delete"));
        // Lock icon.
        assert!(matches!(result.icon, Some(KitIcon::Emoji(ref e)) if e == "🔒"));
    }

    #[test]
    fn entry_to_result_no_subtitle_when_no_source_app() {
        let entry = store::ClipboardEntry {
            id: 1,
            content_hash: 111,
            preview: "test".to_string(),
            full_content: "test".to_string(),
            source_app: None,
            timestamp: chrono::Utc::now(),
            pinned: false,
            redacted: false,
        };
        let result = ClipboardKit::entry_to_result(&entry);
        assert!(result.subtitle.is_none());
    }

    // ── Config edge cases ───────────────────────────────────────

    #[test]
    fn should_default_missing_config_values() {
        let mut cfg = default_config();
        // Kit section with no extra values — all should default.
        cfg.kits.insert(
            "clipboard".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: std::collections::HashMap::new(),
                extra: std::collections::HashMap::new(),
            },
        );
        let kit = ClipboardKit::new(&cfg);
        assert_eq!(kit.config.max_history, DEFAULT_MAX_HISTORY);
        assert_eq!(kit.config.retention_days, DEFAULT_RETENTION_DAYS);
        assert!(kit.config.sensitive_detection);
        assert!(kit.config.excluded_apps.is_empty());
    }

    #[test]
    fn should_default_wrong_type_config_values() {
        let mut cfg = default_config();
        let mut extra = std::collections::HashMap::new();
        // String instead of integer — should fall back to default.
        extra.insert("max_history".to_string(), toml::Value::String("not a number".to_string()));
        cfg.kits.insert(
            "clipboard".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: std::collections::HashMap::new(),
                extra,
            },
        );
        let kit = ClipboardKit::new(&cfg);
        assert_eq!(kit.config.max_history, DEFAULT_MAX_HISTORY);
    }

    // ── Search behavior ─────────────────────────────────────────

    /// Helper: create a kit with pre-populated store entries.
    fn kit_with_entries(entries: &[(&str, bool)]) -> ClipboardKit {
        let kit = ClipboardKit::new(&default_config());
        let mut store = ClipboardStore::in_memory(200, 7);
        for (content, pinned) in entries {
            let id = store.insert(content, None);
            if *pinned {
                store.toggle_pin(id);
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        // Replace the empty store with our populated one.
        *kit.store.try_write().unwrap() = store;
        kit
    }

    #[test]
    fn search_empty_query_returns_pinned_first() {
        let kit =
            kit_with_entries(&[("regular", false), ("pinned item", true), ("another", false)]);
        let results = kit.search(CMD_HISTORY, "");
        assert!(!results.is_empty());
        // First result should be pinned.
        assert!(results[0].accessories.iter().any(|a| matches!(a, Accessory::Icon { .. })));
    }

    #[test]
    fn search_returns_fuzzy_matches() {
        let kit = kit_with_entries(&[
            ("hello world", false),
            ("goodbye world", false),
            ("unrelated text", false),
        ]);
        let results = kit.search(CMD_HISTORY, "hello");
        assert!(!results.is_empty());
        assert_eq!(results[0].title, "hello world");
    }

    #[test]
    fn search_returns_empty_for_no_match() {
        let kit = kit_with_entries(&[("hello world", false)]);
        let results = kit.search(CMD_HISTORY, "zzzzzzz");
        assert!(results.is_empty());
    }

    #[test]
    fn search_limits_results_to_20() {
        let entries: Vec<(&str, bool)> =
            (0..30).map(|_| ("some text that matches query", false)).collect();
        let _kit = kit_with_entries(&entries);
        let kit2 = ClipboardKit::new(&default_config());
        {
            let mut store = ClipboardStore::in_memory(200, 7);
            for i in 0..30 {
                store.insert(&format!("entry number {i}"), None);
            }
            *kit2.store.try_write().unwrap() = store;
        }
        let results = kit2.search(CMD_HISTORY, "");
        assert!(results.len() <= 20);
    }

    // ── Execute command ─────────────────────────────────────────

    #[tokio::test]
    async fn execute_clear_removes_non_pinned() {
        let kit = kit_with_entries(&[("regular", false), ("pinned", true), ("other", false)]);
        let output = kit.execute(CMD_CLEAR).await.unwrap();

        match output {
            CommandOutput::Message { text } => assert!(text.contains('2')),
            CommandOutput::Done => panic!("expected Message"),
        }

        let store = kit.store.read().await;
        assert_eq!(store.len(), 1);
        let remaining = store.all_sorted();
        assert!(remaining[0].pinned);
        drop(store);
    }

    #[tokio::test]
    async fn execute_unknown_command_returns_error() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.execute("nonexistent").await.is_err());
    }

    #[tokio::test]
    async fn execute_clear_on_empty_store() {
        let kit = ClipboardKit::new(&default_config());
        let output = kit.execute(CMD_CLEAR).await.unwrap();
        match output {
            CommandOutput::Message { text } => assert!(text.contains('0')),
            CommandOutput::Done => panic!("expected Message"),
        }
    }

    // ── Handle custom action ────────────────────────────────────

    #[tokio::test]
    async fn handle_toggle_pin_success() {
        let kit = kit_with_entries(&[("test content", false)]);
        let result = kit.handle_custom_action("toggle_pin:1").await.unwrap();
        assert_eq!(result, Some("Pinned".to_string()));

        let result = kit.handle_custom_action("toggle_pin:1").await.unwrap();
        assert_eq!(result, Some("Unpinned".to_string()));
    }

    #[tokio::test]
    async fn handle_delete_success() {
        let kit = kit_with_entries(&[("to delete", false)]);
        let result = kit.handle_custom_action("delete:1").await.unwrap();
        assert!(result.is_none());

        let store = kit.store.read().await;
        assert_eq!(store.len(), 0);
        drop(store);
    }

    #[tokio::test]
    async fn handle_invalid_action_id_format() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.handle_custom_action("no_colon").await.is_err());
    }

    #[tokio::test]
    async fn handle_invalid_entry_id() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.handle_custom_action("toggle_pin:not_a_number").await.is_err());
    }

    #[tokio::test]
    async fn handle_unknown_action() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.handle_custom_action("explode:1").await.is_err());
    }

    #[tokio::test]
    async fn handle_nonexistent_entry() {
        let kit = ClipboardKit::new(&default_config());
        assert!(kit.handle_custom_action("toggle_pin:999").await.is_err());
        assert!(kit.handle_custom_action("delete:999").await.is_err());
    }

    // ── Time ago edge cases ─────────────────────────────────────

    #[test]
    fn time_ago_at_boundaries() {
        use chrono::Duration;
        let now = chrono::Utc::now();

        // Exactly 60 seconds → should be "1 min ago" not "just now".
        assert_eq!(ClipboardKit::time_ago(now - Duration::seconds(60)), "1 min ago");
        // 59 seconds → "just now".
        assert_eq!(ClipboardKit::time_ago(now - Duration::seconds(59)), "just now");
        // Exactly 1 hour.
        assert_eq!(ClipboardKit::time_ago(now - Duration::seconds(3600)), "1 hr ago");
    }
}
