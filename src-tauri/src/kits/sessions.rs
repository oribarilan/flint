//! Sessions kit — monitor `OpenCode` sessions across multiple servers.
//!
//! Activated by the prefix `s ` (letter-s + space) or via command discovery.
//! Renders live session snapshots from the in-memory `ServerRegistry`.
//!
//! **Prefix safety:** the prefix is `"s "` (with trailing space). A bare `s`
//! typed by the user (e.g., as part of `"safari"`) does **not** activate this
//! kit — the kit's prefix requires the space delimiter to be present. This is
//! enforced in `KitRegistry::search_by_prefix` via the delimiter-safe matching
//! rule: if a prefix ends without a space, it must be followed by a space
//! character in the query string.

use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::RwLock;

use super::{CommandDef, CommandMode, KitAction, KitIcon, KitManifest, KitResult, ResultKind};
use crate::kits::{Accessory, Kit};
use crate::providers::opencode::monitor::{ServerRegistry, SessionStatus};

// ---------------------------------------------------------------------------
// SVG icon: a small grid of 4 dots (2×2) — symbolises multiple sessions
// ---------------------------------------------------------------------------

const KIT_ICON_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>"#;

fn kit_icon() -> KitIcon {
    KitIcon::DataUri(format!("data:image/svg+xml,{}", urlencoding::encode(KIT_ICON_SVG)))
}

/// Prefix that activates the Sessions kit — note the trailing space.
///
/// The registry's delimiter-safe matching ensures that `"s"` alone (e.g. as
/// the start of `"safari"`) does NOT trigger this kit. Only `"s "` followed
/// by the user's sub-query will activate it.
pub const SESSIONS_PREFIX: &str = "s ";

const COMMAND_ID: &str = "sessions";

/// Maximum number of session results to return on any query.
const MAX_RESULTS: usize = 20;

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

/// Sessions kit — exposes monitored `OpenCode` session snapshots via search.
pub struct SessionsKit {
    manifest: KitManifest,
    registry: Arc<RwLock<ServerRegistry>>,
}

impl SessionsKit {
    /// Create a new Sessions kit backed by the given server registry.
    pub fn new(registry: Arc<RwLock<ServerRegistry>>) -> Self {
        Self {
            manifest: KitManifest {
                id: "sessions",
                name: "Sessions",
                description: "Monitor OpenCode sessions across servers",
                icon: kit_icon(),
            },
            registry,
        }
    }
}

// ---------------------------------------------------------------------------
// Kit trait implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl Kit for SessionsKit {
    fn manifest(&self) -> &KitManifest {
        &self.manifest
    }

    fn commands(&self) -> Vec<CommandDef> {
        vec![CommandDef {
            id: COMMAND_ID,
            name: "Sessions",
            description: "Monitor OpenCode sessions across servers",
            icon: kit_icon(),
            mode: CommandMode::InputResults,
            default_prefix: Some(SESSIONS_PREFIX),
            default_hotkey: None,
        }]
    }

    fn search(&self, _command_id: &str, query: &str) -> Vec<KitResult> {
        // Grab a sync snapshot — the RwLock is an async lock so we use
        // `try_read()` which never blocks. If the lock is write-held (rare
        // and brief during SSE updates) we return an empty slice; the next
        // keystroke will succeed.
        let Ok(reg) = self.registry.try_read() else {
            return vec![];
        };

        let snapshots = reg.sessions_snapshot();

        if snapshots.is_empty() {
            return vec![empty_state_result(&reg)];
        }

        let needle = query.trim().to_lowercase();

        snapshots
            .into_iter()
            .filter(|s| {
                // With an empty query show everything; otherwise fuzzy-ish
                // substring filter on title and server label.
                needle.is_empty()
                    || s.title.to_lowercase().contains(&needle)
                    || s.server_label.to_lowercase().contains(&needle)
            })
            .take(MAX_RESULTS)
            .map(|s| {
                let status_color = s.status.badge_color();
                let status_label = s.status.label();

                KitResult {
                    id: format!("session:{}:{}", s.server_id, s.session_id),
                    title: s.title.clone(),
                    subtitle: Some(s.server_label.clone()),
                    icon: Some(kit_icon()),
                    kind: ResultKind::File,
                    accessories: vec![
                        Accessory::Badge {
                            text: status_label.to_string(),
                            color: status_color.to_string(),
                        },
                        Accessory::Text { value: format_age(s.age_seconds) },
                    ],
                    actions: vec![KitAction::Copy {
                        text: format!("{} — {} ({})", s.title, s.server_label, status_label),
                        label: Some("Copy summary".to_string()),
                    }],
                    preview: None,
                    score: Some(score_for_status(&s.status)),
                }
            })
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return a single informational result when no sessions are available.
fn empty_state_result(reg: &ServerRegistry) -> KitResult {
    let (title, subtitle) = if reg.server_count() == 0 {
        (
            "No servers configured".to_string(),
            Some("Add OpenCode servers in Agent settings".to_string()),
        )
    } else {
        (
            "No active sessions".to_string(),
            Some(format!(
                "Watching {} server{}",
                reg.server_count(),
                if reg.server_count() == 1 { "" } else { "s" }
            )),
        )
    };

    KitResult {
        id: "sessions-empty".to_string(),
        title,
        subtitle,
        icon: Some(kit_icon()),
        kind: ResultKind::File,
        accessories: Vec::new(),
        actions: vec![KitAction::Copy { text: String::new(), label: None }],
        preview: None,
        score: None,
    }
}

/// Higher score = ranked higher in results. Working sessions float to the top.
const fn score_for_status(status: &SessionStatus) -> u32 {
    match status {
        SessionStatus::Working => 100,
        SessionStatus::Waiting => 80,
        SessionStatus::Error => 60,
        SessionStatus::Idle => 40,
    }
}

/// Format seconds-since-update into a human-readable string.
fn format_age(seconds: u32) -> String {
    if seconds < 60 {
        "just now".to_string()
    } else if seconds < 3600 {
        format!("{} min ago", seconds / 60)
    } else if seconds < 86400 {
        format!("{} hr ago", seconds / 3600)
    } else {
        format!("{} d ago", seconds / 86400)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::time::{Duration, SystemTime};

    use super::*;
    use crate::config::MonitoredServerConfig;
    use crate::kits::Kit;
    use crate::providers::opencode::monitor::{MonitoredSession, ServerRegistry, SessionStatus};

    fn make_registry() -> Arc<RwLock<ServerRegistry>> {
        Arc::new(RwLock::new(ServerRegistry::new()))
    }

    fn cfg(id: &str, port: u16) -> MonitoredServerConfig {
        MonitoredServerConfig {
            id: id.to_string(),
            host: "localhost".to_string(),
            port,
            label: None,
        }
    }

    fn session(
        server_id: &str,
        session_id: &str,
        title: &str,
        status: SessionStatus,
    ) -> MonitoredSession {
        let mut s =
            MonitoredSession::new(session_id.to_string(), server_id.to_string(), title.to_string());
        s.status = status;
        s
    }

    fn kit_with_sessions(sessions: Vec<MonitoredSession>) -> SessionsKit {
        let registry = make_registry();
        {
            let mut reg = registry.blocking_write();
            reg.replace_config(&[cfg("s1", 14096)]);
            for sess in sessions {
                reg.update_session(sess);
            }
        }
        SessionsKit::new(registry)
    }

    // ── command definition ───────────────────────────────────────

    #[test]
    fn exposes_single_sessions_command() {
        let kit = SessionsKit::new(make_registry());
        let cmds = kit.commands();
        assert_eq!(cmds.len(), 1);
        assert_eq!(cmds[0].id, COMMAND_ID);
        assert_eq!(cmds[0].mode, CommandMode::InputResults);
    }

    #[test]
    fn prefix_ends_with_space_delimiter() {
        let kit = SessionsKit::new(make_registry());
        let prefix = kit.commands()[0].default_prefix.unwrap();
        assert!(
            prefix.ends_with(' '),
            "sessions prefix must end with a space for delimiter-safe matching; got {prefix:?}",
        );
    }

    #[test]
    fn no_default_hotkey() {
        let kit = SessionsKit::new(make_registry());
        assert!(kit.commands()[0].default_hotkey.is_none());
    }

    // ── empty state ──────────────────────────────────────────────

    #[test]
    fn empty_query_no_servers_returns_no_servers_configured_message() {
        let kit = SessionsKit::new(make_registry());
        let results = kit.search(COMMAND_ID, "");
        assert_eq!(results.len(), 1);
        assert!(results[0].title.contains("No servers"));
    }

    #[test]
    fn empty_query_servers_but_no_sessions_returns_no_active_sessions() {
        let registry = make_registry();
        {
            let mut reg = registry.blocking_write();
            reg.replace_config(&[cfg("s1", 14096)]);
        }
        let kit = SessionsKit::new(registry);
        let results = kit.search(COMMAND_ID, "");
        assert_eq!(results.len(), 1);
        assert!(results[0].title.contains("No active sessions"));
    }

    // ── search results ───────────────────────────────────────────

    #[test]
    fn empty_query_returns_all_sessions() {
        let kit = kit_with_sessions(vec![
            session("s1", "a", "Alpha project", SessionStatus::Idle),
            session("s1", "b", "Beta work", SessionStatus::Working),
        ]);
        let results = kit.search(COMMAND_ID, "");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn query_filters_by_title_substring() {
        let kit = kit_with_sessions(vec![
            session("s1", "a", "Alpha project", SessionStatus::Idle),
            session("s1", "b", "Beta work", SessionStatus::Working),
        ]);
        let results = kit.search(COMMAND_ID, "alpha");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Alpha project");
    }

    #[test]
    fn query_is_case_insensitive() {
        let kit = kit_with_sessions(vec![session("s1", "a", "Alpha project", SessionStatus::Idle)]);
        assert_eq!(kit.search(COMMAND_ID, "ALPHA").len(), 1);
        assert_eq!(kit.search(COMMAND_ID, "Alpha").len(), 1);
    }

    #[test]
    fn no_match_returns_empty() {
        let kit = kit_with_sessions(vec![session("s1", "a", "Alpha", SessionStatus::Idle)]);
        assert!(kit.search(COMMAND_ID, "zzz").is_empty());
    }

    #[test]
    fn results_are_capped_at_max() {
        let sessions: Vec<_> = (0..30)
            .map(|i| session("s1", &i.to_string(), &format!("Session {i}"), SessionStatus::Idle))
            .collect();
        let registry = make_registry();
        {
            let mut reg = registry.blocking_write();
            reg.replace_config(&[cfg("s1", 14096)]);
            for s in sessions {
                reg.update_session(s);
            }
        }
        let kit = SessionsKit::new(registry);
        let results = kit.search(COMMAND_ID, "");
        assert!(results.len() <= MAX_RESULTS);
    }

    // ── accessories ──────────────────────────────────────────────

    #[test]
    fn result_has_status_badge_accessory() {
        let kit = kit_with_sessions(vec![session("s1", "a", "Work", SessionStatus::Working)]);
        let results = kit.search(COMMAND_ID, "");
        let accessories = &results[0].accessories;
        let has_badge = accessories
            .iter()
            .any(|a| matches!(a, Accessory::Badge { text, .. } if text == "Working"));
        assert!(has_badge, "expected a Working badge accessory");
    }

    #[test]
    fn result_has_age_text_accessory() {
        let kit = kit_with_sessions(vec![session("s1", "a", "Work", SessionStatus::Idle)]);
        let results = kit.search(COMMAND_ID, "");
        let has_age = results[0].accessories.iter().any(|a| matches!(a, Accessory::Text { .. }));
        assert!(has_age, "expected a text (age) accessory");
    }

    #[test]
    fn result_subtitle_is_server_label() {
        let registry = make_registry();
        {
            let mut reg = registry.blocking_write();
            reg.replace_config(&[MonitoredServerConfig {
                id: "s1".to_string(),
                host: "my-host".to_string(),
                port: 14096,
                label: Some("My Server".to_string()),
            }]);
            reg.update_session(session("s1", "a", "Work", SessionStatus::Idle));
        }
        let kit = SessionsKit::new(registry);
        let results = kit.search(COMMAND_ID, "");
        assert_eq!(results[0].subtitle.as_deref(), Some("My Server"));
    }

    // ── status scoring ───────────────────────────────────────────

    #[test]
    fn working_sessions_have_higher_score_than_idle() {
        assert!(score_for_status(&SessionStatus::Working) > score_for_status(&SessionStatus::Idle));
    }

    #[test]
    fn error_sessions_have_higher_score_than_idle() {
        assert!(score_for_status(&SessionStatus::Error) > score_for_status(&SessionStatus::Idle));
    }

    // ── age formatting ───────────────────────────────────────────

    #[test]
    fn format_age_under_60_seconds() {
        assert_eq!(format_age(30), "just now");
        assert_eq!(format_age(0), "just now");
    }

    #[test]
    fn format_age_minutes() {
        assert_eq!(format_age(90), "1 min ago");
        assert_eq!(format_age(3599), "59 min ago");
    }

    #[test]
    fn format_age_hours() {
        assert_eq!(format_age(3600), "1 hr ago");
        assert_eq!(format_age(7200), "2 hr ago");
    }

    #[test]
    fn format_age_days() {
        assert_eq!(format_age(86400), "1 d ago");
    }

    // ── prefix safety ─────────────────────────────────────────────

    #[test]
    fn prefix_is_two_chars_with_trailing_space() {
        // Ensures we didn't accidentally collapse the prefix to bare "s"
        assert_eq!(SESSIONS_PREFIX, "s ");
        assert_eq!(SESSIONS_PREFIX.len(), 2);
    }

    #[test]
    fn prefix_constant_matches_command_definition() {
        let kit = SessionsKit::new(make_registry());
        let cmd = &kit.commands()[0];
        assert_eq!(cmd.default_prefix, Some(SESSIONS_PREFIX));
    }

    // ── stable result ids ─────────────────────────────────────────

    #[test]
    fn result_ids_include_server_and_session_id() {
        let kit = kit_with_sessions(vec![session("s1", "sess-abc", "Work", SessionStatus::Idle)]);
        let results = kit.search(COMMAND_ID, "");
        assert!(results[0].id.contains("s1"));
        assert!(results[0].id.contains("sess-abc"));
    }

    // ── searching older sessions ──────────────────────────────────

    #[test]
    fn recent_sessions_appear_before_old_ones() {
        let registry = make_registry();
        {
            let mut reg = registry.blocking_write();
            reg.replace_config(&[cfg("s1", 14096)]);

            let mut old =
                MonitoredSession::new("old".to_string(), "s1".to_string(), "Old".to_string());
            old.updated_at = SystemTime::now() - Duration::from_secs(120);

            let recent =
                MonitoredSession::new("new".to_string(), "s1".to_string(), "New".to_string());

            reg.update_session(old);
            reg.update_session(recent);
        }
        let kit = SessionsKit::new(registry);
        let results = kit.search(COMMAND_ID, "");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "New");
        assert_eq!(results[1].title, "Old");
    }
}
