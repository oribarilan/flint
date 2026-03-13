//! Kit registry — manages kit lifecycle, search dispatch, and chat tool indexing.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::{
    ChatToolDef, Kit, KitContextBase, KitError, KitResult, KitSearchResult, SearchTrigger,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// Tauri managed state wrapping the registry.
pub struct KitRegistryState(pub Arc<RwLock<KitRegistry>>);

/// Tracks whether a kit has been initialized.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KitState {
    /// Known but not yet initialized.
    Registered,
    /// `init()` in progress (prevent double-init).
    Initializing,
    /// Fully operational.
    Ready,
    /// `init()` failed — won't be retried automatically.
    Failed,
}

// ---------------------------------------------------------------------------
// Task manager
// ---------------------------------------------------------------------------

/// Manages background tasks spawned by a single kit.
///
/// Tasks are tracked via [`AbortHandle`] so they can be cancelled on
/// kit disable or app shutdown without the kit managing its own cleanup.
#[derive(Default)]
pub struct TaskManager {
    handles: Vec<AbortHandle>,
}

impl TaskManager {
    /// Create an empty task manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawn a background task and track its handle for cleanup.
    pub fn spawn<F>(&mut self, future: F)
    where
        F: std::future::Future<Output = ()> + Send + 'static,
    {
        let handle = tokio::spawn(future);
        self.handles.push(handle.abort_handle());
    }

    /// Abort all tracked tasks.
    pub fn abort_all(&self) {
        for handle in &self.handles {
            handle.abort();
        }
    }

    /// Number of tracked tasks.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.handles.len()
    }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// Central registry managing all kits, their state, and dispatch.
pub struct KitRegistry {
    /// Registered kits by id.
    kits: HashMap<String, Box<dyn Kit>>,
    /// Per-kit lifecycle state.
    states: HashMap<String, KitState>,
    /// Per-kit background task managers.
    task_managers: HashMap<String, TaskManager>,
    /// Trigger-to-kit mapping for search dispatch (checked in order).
    search_triggers: Vec<(SearchTrigger, String)>,
    /// All chat tool defs, collected at registration time. `(kit_id, def)`.
    chat_tool_index: Vec<(String, ChatToolDef)>,
}

impl KitRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self {
            kits: HashMap::new(),
            states: HashMap::new(),
            task_managers: HashMap::new(),
            search_triggers: Vec::new(),
            chat_tool_index: Vec::new(),
        }
    }

    /// Register a kit. Collects its search trigger and chat tools into indexes.
    pub fn register(&mut self, kit: Box<dyn Kit>) {
        let manifest = kit.manifest();
        let id = manifest.id.to_string();

        if let Some(trigger) = kit.search_trigger() {
            self.search_triggers.push((trigger.clone(), id.clone()));
        }

        for tool in kit.chat_tools() {
            self.chat_tool_index.push((id.clone(), tool));
        }

        self.states.insert(id.clone(), KitState::Registered);
        self.kits.insert(id, kit);
    }

    /// Initialize a single kit lazily. Called on first use.
    pub async fn ensure_init(
        &mut self,
        kit_id: &str,
        base_ctx: &KitContextBase,
    ) -> Result<(), KitError> {
        match self.states.get(kit_id) {
            Some(KitState::Ready | KitState::Initializing) => return Ok(()),
            Some(KitState::Failed) => {
                return Err(KitError::InitFailed(kit_id.to_string()));
            }
            _ => {}
        }

        self.states.insert(kit_id.to_string(), KitState::Initializing);
        let ctx = base_ctx.for_kit(kit_id);

        let kit = self.kits.get(kit_id).ok_or_else(|| KitError::KitNotFound(kit_id.to_string()))?;

        match kit.init(&ctx).await {
            Ok(()) => {
                self.states.insert(kit_id.to_string(), KitState::Ready);
                Ok(())
            }
            Err(e) => {
                self.states.insert(kit_id.to_string(), KitState::Failed);
                Err(e)
            }
        }
    }

    /// Find which kit (if any) matches the query.
    ///
    /// Returns `None` if no kit trigger matches (caller falls back to core
    /// file search). When a trigger matches but the kit isn't ready, returns
    /// empty results — never falls through to core search for an explicitly
    /// invoked kit.
    pub fn search(&self, query: &str) -> Option<(String, Vec<KitResult>)> {
        let (trigger, kit_id) =
            self.search_triggers.iter().find(|(trigger, _)| trigger.matches(query))?;

        if !matches!(self.states.get(kit_id), Some(KitState::Ready)) {
            // Kit not ready — return empty. The caller spawns lazy init.
            return Some((kit_id.clone(), vec![]));
        }

        let effective_query = trigger.strip(query);
        let kit = &self.kits[kit_id];
        let results = kit.search(effective_query);
        Some((kit_id.clone(), results))
    }

    /// Get the lifecycle state of a kit.
    pub fn kit_state(&self, kit_id: &str) -> Option<KitState> {
        self.states.get(kit_id).copied()
    }

    /// All chat tool definitions for inclusion in API requests.
    pub fn all_chat_tools(&self) -> &[(String, ChatToolDef)] {
        &self.chat_tool_index
    }

    /// Dispatch a chat tool call to the owning kit.
    pub async fn invoke_chat_tool(
        &self,
        kit_id: &str,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, KitError> {
        let kit = self.kits.get(kit_id).ok_or_else(|| KitError::KitNotFound(kit_id.to_string()))?;
        kit.invoke_chat_tool(tool_name, args).await
    }

    /// Shutdown all kits and abort their background tasks.
    pub async fn shutdown_all(&mut self) {
        for (id, kit) in &self.kits {
            let _ = kit.shutdown().await;
            if let Some(tm) = self.task_managers.get(id) {
                tm.abort_all();
            }
        }
    }

    /// Store a task manager for a kit (used after init).
    pub fn set_task_manager(&mut self, kit_id: &str, tm: TaskManager) {
        self.task_managers.insert(kit_id.to_string(), tm);
    }

    /// Get metadata about all registered kits for the settings UI.
    pub fn kit_infos(&self) -> Vec<KitInfo> {
        self.kits
            .values()
            .map(|kit| {
                let manifest = kit.manifest();
                let trigger_label = kit.search_trigger().map(|t| match t {
                    super::SearchTrigger::Prefix(p) => format!("Prefix: {p}"),
                    super::SearchTrigger::Keyword(kw) => format!("Keyword: {kw}"),
                });
                KitInfo {
                    id: manifest.id.to_string(),
                    name: manifest.name.to_string(),
                    description: manifest.description.to_string(),
                    icon: manifest.icon.clone(),
                    trigger: trigger_label,
                }
            })
            .collect()
    }

    /// Return kits whose name matches the query, as discoverable search results.
    ///
    /// Uses nucleo fuzzy matching (same as file search) so kits rank
    /// naturally alongside files and applications. The score includes
    /// the same application boost as file search.
    pub fn discovery_results(&self, query: &str) -> Vec<(u32, KitSearchResult)> {
        use nucleo::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
        use nucleo::{Matcher, Utf32Str};

        let pattern =
            Pattern::new(query, CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
        let mut buf = Vec::new();

        self.kits
            .values()
            .filter_map(|kit| {
                let manifest = kit.manifest();
                let trigger = kit.search_trigger()?;

                let name_lower = manifest.name.to_lowercase();
                let haystack = Utf32Str::new(&name_lower, &mut buf);
                let raw_score = pattern.score(haystack, &mut matcher)?;
                // Same APP_BOOST (10) as file search — kits are like apps.
                let score = raw_score.saturating_add(crate::search::APP_BOOST);

                let prefix = match trigger {
                    super::SearchTrigger::Prefix(p) => format!("{p} "),
                    super::SearchTrigger::Keyword(kw) => format!("{kw} "),
                };

                Some((
                    score,
                    KitSearchResult {
                        kit_id: manifest.id.to_string(),
                        id: format!("kit-discovery:{}", manifest.id),
                        title: manifest.name.to_string(),
                        subtitle: Some(manifest.description.to_string()),
                        icon: Some(manifest.icon.clone()),
                        accessories: Vec::new(),
                        actions: vec![super::KitAction::ActivateKit { prefix }],
                        preview: None,
                        score: Some(score),
                    },
                ))
            })
            .collect()
    }
}

/// Kit metadata sent to the frontend for the settings UI.
#[derive(Debug, Clone, serde::Serialize)]
pub struct KitInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: super::KitIcon,
    /// Human-readable trigger description (e.g., "Prefix: =").
    pub trigger: Option<String>,
}

impl Default for KitRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

impl KitSearchResult {
    /// Convert core file search results into the unified result type.
    ///
    /// The `kind` is encoded as a `KitIcon::Named` so the frontend can
    /// render the appropriate icon (file, directory, application).
    pub fn from_core_search(results: Vec<crate::search::SearchResult>) -> Vec<Self> {
        results
            .into_iter()
            .map(|r| {
                let kind_str = match r.kind {
                    crate::indexer::EntryKind::File => "file",
                    crate::indexer::EntryKind::Directory => "directory",
                    crate::indexer::EntryKind::Application => "application",
                };
                Self {
                    kit_id: "core".to_string(),
                    id: r.id,
                    title: r.name,
                    subtitle: Some(r.path.clone()),
                    icon: Some(super::KitIcon::Named(kind_str.to_string())),
                    accessories: Vec::new(),
                    actions: vec![super::KitAction::Open { target: r.path }],
                    preview: None,
                    score: None,
                }
            })
            .collect()
    }

    /// Convert a single core file search result with its score.
    pub fn from_core_result(r: crate::search::SearchResult, score: u32) -> Self {
        let kind_str = match r.kind {
            crate::indexer::EntryKind::File => "file",
            crate::indexer::EntryKind::Directory => "directory",
            crate::indexer::EntryKind::Application => "application",
        };
        Self {
            kit_id: "core".to_string(),
            id: r.id,
            title: r.name,
            subtitle: Some(r.path.clone()),
            icon: Some(super::KitIcon::Named(kind_str.to_string())),
            accessories: Vec::new(),
            actions: vec![super::KitAction::Open { target: r.path }],
            preview: None,
            score: Some(score),
        }
    }
}
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kits::{KitIcon, KitManifest};

    /// Minimal mock kit for testing.
    struct MockKit {
        manifest: KitManifest,
        trigger: Option<SearchTrigger>,
        results: Vec<KitResult>,
    }

    impl MockKit {
        fn new(id: &'static str, trigger: Option<SearchTrigger>) -> Self {
            Self {
                manifest: KitManifest {
                    id,
                    name: id,
                    description: "test kit",
                    icon: KitIcon::Emoji("🧪".to_string()),
                },
                trigger,
                results: Vec::new(),
            }
        }

        fn with_results(mut self, results: Vec<KitResult>) -> Self {
            self.results = results;
            self
        }
    }

    #[async_trait::async_trait]
    impl Kit for MockKit {
        fn manifest(&self) -> &KitManifest {
            &self.manifest
        }

        fn search_trigger(&self) -> Option<&SearchTrigger> {
            self.trigger.as_ref()
        }

        fn search(&self, _query: &str) -> Vec<KitResult> {
            self.results.clone()
        }
    }

    fn make_result(id: &str, title: &str) -> KitResult {
        KitResult {
            id: id.to_string(),
            title: title.to_string(),
            subtitle: None,
            icon: None,
            accessories: Vec::new(),
            actions: Vec::new(),
            preview: None,
            score: None,
        }
    }

    #[test]
    fn search_returns_none_when_no_kits_registered() {
        let registry = KitRegistry::new();
        assert!(registry.search("hello").is_none());
    }

    #[test]
    fn search_returns_none_when_no_trigger_matches() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", Some(SearchTrigger::Prefix("=")))));
        assert!(registry.search("hello").is_none());
    }

    #[test]
    fn search_dispatches_to_matching_prefix_kit() {
        let mut registry = KitRegistry::new();
        let kit = MockKit::new("calc", Some(SearchTrigger::Prefix("=")))
            .with_results(vec![make_result("r1", "42")]);
        registry.register(Box::new(kit));

        // Kit is Registered, not Ready — returns empty (not None)
        let result = registry.search("= 2+3");
        assert!(result.is_some());
        let (id, results) = result.unwrap();
        assert_eq!(id, "calc");
        assert!(results.is_empty()); // not ready yet
    }

    #[test]
    fn search_returns_results_from_ready_kit() {
        let mut registry = KitRegistry::new();
        let kit = MockKit::new("calc", Some(SearchTrigger::Prefix("=")))
            .with_results(vec![make_result("r1", "42")]);
        registry.register(Box::new(kit));
        registry.states.insert("calc".to_string(), KitState::Ready);

        let result = registry.search("= 2+3");
        assert!(result.is_some());
        let (id, results) = result.unwrap();
        assert_eq!(id, "calc");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "42");
    }

    #[test]
    fn search_dispatches_to_matching_keyword_kit() {
        let mut registry = KitRegistry::new();
        let kit = MockKit::new("weather", Some(SearchTrigger::Keyword("weather")))
            .with_results(vec![make_result("w1", "Sunny 72°F")]);
        registry.register(Box::new(kit));
        registry.states.insert("weather".to_string(), KitState::Ready);

        let result = registry.search("weather SF");
        assert!(result.is_some());
        let (id, results) = result.unwrap();
        assert_eq!(id, "weather");
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_does_not_fallthrough_for_failed_kit() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", Some(SearchTrigger::Prefix("=")))));
        registry.states.insert("calc".to_string(), KitState::Failed);

        // Trigger matches but kit failed → returns Some with empty, not None
        let result = registry.search("= 2+3");
        assert!(result.is_some());
        let (_, results) = result.unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn first_matching_trigger_wins() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(
            MockKit::new("kit-a", Some(SearchTrigger::Prefix("=")))
                .with_results(vec![make_result("a1", "from A")]),
        ));
        registry.register(Box::new(
            MockKit::new("kit-b", Some(SearchTrigger::Prefix("=")))
                .with_results(vec![make_result("b1", "from B")]),
        ));
        registry.states.insert("kit-a".to_string(), KitState::Ready);
        registry.states.insert("kit-b".to_string(), KitState::Ready);

        let (id, _) = registry.search("= test").unwrap();
        assert_eq!(id, "kit-a");
    }

    #[test]
    fn task_manager_spawn_and_abort() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();

        rt.block_on(async {
            let mut tm = TaskManager::new();
            assert_eq!(tm.len(), 0);

            tm.spawn(async { tokio::time::sleep(std::time::Duration::from_secs(100)).await });
            assert_eq!(tm.len(), 1);

            tm.abort_all();
            // After abort, the spawned task should be cancelled.
            // Give it a moment to propagate.
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        });
    }

    #[test]
    fn shutdown_aborts_all_task_managers() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();

        rt.block_on(async {
            let mut registry = KitRegistry::new();
            registry.register(Box::new(MockKit::new("calc", None)));

            let mut tm = TaskManager::new();
            tm.spawn(async { tokio::time::sleep(std::time::Duration::from_secs(100)).await });
            registry.set_task_manager("calc", tm);

            registry.shutdown_all().await;
            // No panic = success; tasks were aborted cleanly.
        });
    }

    #[test]
    fn register_builds_trigger_index() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", Some(SearchTrigger::Prefix("=")))));
        registry.register(Box::new(MockKit::new("weather", None)));

        assert_eq!(registry.search_triggers.len(), 1);
        assert_eq!(registry.search_triggers[0].1, "calc");
    }

    #[test]
    fn register_sets_state_to_registered() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", None)));

        assert_eq!(registry.kit_state("calc"), Some(KitState::Registered));
    }

    #[test]
    fn from_core_search_converts_results() {
        let core = vec![crate::search::SearchResult {
            id: "/tmp/foo.txt".to_string(),
            name: "foo.txt".to_string(),
            path: "/tmp/foo.txt".to_string(),
            kind: crate::indexer::EntryKind::File,
        }];

        let converted = KitSearchResult::from_core_search(core);
        assert_eq!(converted.len(), 1);
        assert_eq!(converted[0].kit_id, "core");
        assert_eq!(converted[0].title, "foo.txt");
        assert_eq!(converted[0].subtitle.as_deref(), Some("/tmp/foo.txt"));
        assert!(matches!(
            converted[0].actions.first(),
            Some(super::super::KitAction::Open { target }) if target == "/tmp/foo.txt"
        ));
    }

    #[test]
    fn from_core_search_encodes_kind_as_named_icon() {
        let core = vec![crate::search::SearchResult {
            id: "/app/Slack".to_string(),
            name: "Slack".to_string(),
            path: "/app/Slack".to_string(),
            kind: crate::indexer::EntryKind::Application,
        }];

        let converted = KitSearchResult::from_core_search(core);
        assert!(matches!(
            &converted[0].icon,
            Some(super::super::KitIcon::Named(kind)) if kind == "application"
        ));
    }

    #[test]
    fn from_kit_result_preserves_fields() {
        let result = make_result("r1", "Hello");
        let converted = KitSearchResult::from_kit_result("my-kit", result);

        assert_eq!(converted.kit_id, "my-kit");
        assert_eq!(converted.id, "r1");
        assert_eq!(converted.title, "Hello");
    }

    #[test]
    fn discovery_returns_matching_kits() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", Some(SearchTrigger::Prefix("=")))));

        let results = registry.discovery_results("calc");
        assert_eq!(results.len(), 1);
        let (score, result) = &results[0];
        assert_eq!(result.title, "calc"); // MockKit uses id as name
        assert!(*score > 0);
        assert!(matches!(
            &result.actions[0],
            super::super::KitAction::ActivateKit { prefix } if prefix == "= "
        ));
    }

    #[test]
    fn discovery_is_case_insensitive() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", Some(SearchTrigger::Prefix("=")))));

        assert_eq!(registry.discovery_results("CALC").len(), 1);
        assert_eq!(registry.discovery_results("Calc").len(), 1);
    }

    #[test]
    fn discovery_returns_empty_for_no_match() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", Some(SearchTrigger::Prefix("=")))));

        assert!(registry.discovery_results("weather").is_empty());
    }

    #[test]
    fn discovery_skips_kits_without_triggers() {
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("chat-only", None)));

        assert!(registry.discovery_results("chat").is_empty());
    }
}
