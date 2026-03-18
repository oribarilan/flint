//! Kit registry — manages kit lifecycle, command indexing, and search dispatch.

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;
use tokio::task::AbortHandle;

use super::{
    CommandDef, CommandMode, CommandOutput, Kit, KitContextBase, KitError, KitResult,
    KitSearchResult, ResultKind,
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
    pub const fn len(&self) -> usize {
        self.handles.len()
    }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// Indexed command: command definition + owning kit id + effective config.
struct IndexedCommand {
    kit_id: String,
    def: CommandDef,
    /// Whether this specific command is enabled (from config).
    enabled: bool,
    /// Effective prefix: config override or default.
    effective_prefix: Option<String>,
    /// Effective hotkey: config override or default.
    effective_hotkey: Option<String>,
}

/// Central registry managing all kits, their state, and command dispatch.
pub struct KitRegistry {
    /// Registered kits by id.
    kits: HashMap<String, Box<dyn Kit>>,
    /// Per-kit lifecycle state.
    states: HashMap<String, KitState>,
    /// Per-kit enabled flag (disabled kits are visible in settings but inactive).
    enabled: HashMap<String, bool>,
    /// Per-kit background task managers.
    task_managers: HashMap<String, TaskManager>,
    /// All commands from all kits, with effective config baked in.
    commands: Vec<IndexedCommand>,
}

impl KitRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self {
            kits: HashMap::new(),
            states: HashMap::new(),
            enabled: HashMap::new(),
            task_managers: HashMap::new(),
            commands: Vec::new(),
        }
    }

    /// Register a kit. Reads config to bake in effective prefix/enabled per command.
    ///
    /// All kits are registered (so they appear in Settings). Disabled kits
    /// don't participate in search, discovery, or eager init.
    pub fn register(&mut self, kit: Box<dyn Kit>, config: &crate::config::FlintConfig) {
        let manifest = kit.manifest();
        let id = manifest.id.to_string();
        let kit_cfg = config.kits.get(id.as_str());

        // Determine enabled state: explicit config wins, else kit's default.
        let kit_enabled = kit_cfg.map_or_else(|| kit.default_enabled(), |kc| kc.enabled);

        for def in kit.commands() {
            let cmd_cfg = kit_cfg.and_then(|kc| kc.commands.get(def.id));
            let enabled = kit_enabled && cmd_cfg.is_none_or(|cc| cc.enabled);
            let effective_prefix = cmd_cfg
                .and_then(|cc| cc.prefix.clone())
                .or_else(|| def.default_prefix.map(String::from));
            let effective_hotkey = cmd_cfg
                .and_then(|cc| cc.hotkey.clone())
                .or_else(|| def.default_hotkey.map(String::from));

            self.commands.push(IndexedCommand {
                kit_id: id.clone(),
                def,
                enabled,
                effective_prefix,
                effective_hotkey,
            });
        }

        self.enabled.insert(id.clone(), kit_enabled);
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

    /// Find which command's prefix matches the query.
    ///
    /// Returns `None` if no prefix matches (caller falls back to core search).
    /// When a prefix matches but the kit isn't ready, returns empty results.
    pub fn search_by_prefix(&self, query: &str) -> Option<(String, String, Vec<KitResult>)> {
        let matched = self.commands.iter().find(|ic| {
            ic.enabled
                && ic.effective_prefix.as_ref().is_some_and(|p| query.starts_with(p.as_str()))
        })?;

        let kit_id = &matched.kit_id;
        let command_id = matched.def.id;
        // Safe: the `find` filter above guarantees `effective_prefix` is `Some`.
        let prefix_len = matched.effective_prefix.as_ref()?.len();

        if !matches!(self.states.get(kit_id), Some(KitState::Ready)) {
            return Some((kit_id.clone(), command_id.to_string(), vec![]));
        }

        // Strip prefix and optional following space.
        let after_prefix = &query[prefix_len..];
        let effective_query = after_prefix.strip_prefix(' ').unwrap_or(after_prefix);

        let kit = &self.kits[kit_id];
        let results = kit.search(command_id, effective_query);
        Some((kit_id.clone(), command_id.to_string(), results))
    }

    /// Search within a specific command of a specific kit.
    pub fn search_command(
        &self,
        kit_id: &str,
        command_id: &str,
        query: &str,
    ) -> Result<Vec<KitResult>, KitError> {
        let kit = self.kits.get(kit_id).ok_or_else(|| KitError::KitNotFound(kit_id.to_string()))?;

        // Validate command_id exists for this kit.
        if !kit.commands().iter().any(|cmd| cmd.id == command_id) {
            return Err(KitError::CommandNotFound(command_id.to_string()));
        }

        Ok(kit.search(command_id, query))
    }

    /// Execute a command (for `Execute` mode commands).
    pub async fn execute_command(
        &self,
        kit_id: &str,
        command_id: &str,
    ) -> Result<CommandOutput, KitError> {
        let kit = self.kits.get(kit_id).ok_or_else(|| KitError::KitNotFound(kit_id.to_string()))?;

        // Validate command_id exists for this kit.
        if !kit.commands().iter().any(|cmd| cmd.id == command_id) {
            return Err(KitError::CommandNotFound(command_id.to_string()));
        }

        kit.execute(command_id).await
    }

    /// Dispatch a custom action to the owning kit.
    pub async fn handle_custom_action(
        &self,
        kit_id: &str,
        action_id: &str,
    ) -> Result<Option<String>, KitError> {
        let kit = self.kits.get(kit_id).ok_or_else(|| KitError::KitNotFound(kit_id.to_string()))?;
        kit.handle_custom_action(action_id).await
    }

    /// Get the lifecycle state of a kit.
    pub fn kit_state(&self, kit_id: &str) -> Option<KitState> {
        self.states.get(kit_id).copied()
    }

    /// Get the human-readable name of a kit.
    pub fn kit_name(&self, kit_id: &str) -> Option<&str> {
        self.kits.get(kit_id).map(|k| k.manifest().name)
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

    /// Return IDs of enabled kits that request eager initialization.
    pub fn eager_init_kit_ids(&self) -> Vec<String> {
        self.kits
            .iter()
            .filter(|(id, kit)| {
                kit.eager_init() && self.enabled.get(id.as_str()).copied().unwrap_or(true)
            })
            .map(|(id, _)| id.clone())
            .collect()
    }

    /// Return all enabled commands that have a hotkey assigned.
    pub fn commands_with_hotkeys(&self) -> Vec<CommandHotkeyEntry> {
        self.commands
            .iter()
            .filter(|ic| ic.enabled && ic.effective_hotkey.is_some())
            .filter_map(|ic| {
                Some(CommandHotkeyEntry {
                    kit_id: ic.kit_id.clone(),
                    command_id: ic.def.id.to_string(),
                    mode: ic.def.mode.clone(),
                    name: ic.def.name.to_string(),
                    icon: Some(ic.def.icon.clone()),
                    hotkey: ic.effective_hotkey.clone()?,
                })
            })
            .collect()
    }

    /// Get metadata about all registered kits and their commands.
    ///
    /// Returns all kits (enabled and disabled) so the Settings UI can
    /// display toggles for all of them.
    pub fn kit_infos(&self) -> Vec<KitInfo> {
        self.kits
            .values()
            .map(|kit| {
                let manifest = kit.manifest();
                let kit_enabled = self.enabled.get(manifest.id).copied().unwrap_or(true);
                let commands: Vec<CommandInfo> = self
                    .commands
                    .iter()
                    .filter(|ic| ic.kit_id == manifest.id)
                    .map(|ic| CommandInfo {
                        id: ic.def.id.to_string(),
                        name: ic.def.name.to_string(),
                        description: ic.def.description.to_string(),
                        mode: ic.def.mode.clone(),
                        enabled: ic.enabled,
                        default_prefix: ic.def.default_prefix.map(String::from),
                        effective_prefix: ic.effective_prefix.clone(),
                        effective_hotkey: ic.effective_hotkey.clone(),
                    })
                    .collect();
                KitInfo {
                    id: manifest.id.to_string(),
                    name: manifest.name.to_string(),
                    description: manifest.description.to_string(),
                    icon: manifest.icon.clone(),
                    enabled: kit_enabled,
                    commands,
                }
            })
            .collect()
    }

    /// Return commands whose name matches the query, as discoverable search results.
    ///
    /// Each command is a separate result with `ResultKind::Command`.
    /// Only enabled commands are included.
    pub fn discovery_results(&self, query: &str) -> Vec<(u32, KitSearchResult)> {
        use nucleo::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
        use nucleo::{Matcher, Utf32Str};

        let pattern =
            Pattern::new(query, CaseMatching::Ignore, Normalization::Smart, AtomKind::Fuzzy);
        let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
        let mut buf = Vec::new();

        self.commands
            .iter()
            .filter(|ic| ic.enabled)
            .filter_map(|indexed| {
                let kit_name_str =
                    self.kits.get(&indexed.kit_id).map(|k| k.manifest().name).unwrap_or_default();

                // Match against both the command name and the parent kit name,
                // taking the best score. This lets "window" surface "Left Half"
                // because its parent kit is "Window Management".
                let cmd_lower = indexed.def.name.to_lowercase();
                let cmd_haystack = Utf32Str::new(&cmd_lower, &mut buf);
                let cmd_score = pattern.score(cmd_haystack, &mut matcher);

                let kit_lower = kit_name_str.to_lowercase();
                let kit_haystack = Utf32Str::new(&kit_lower, &mut buf);
                let kit_score = pattern.score(kit_haystack, &mut matcher);

                let raw_score = cmd_score.max(kit_score)?;
                let score = raw_score.saturating_add(crate::search::APP_BOOST);

                Some((
                    score,
                    KitSearchResult {
                        kit_id: indexed.kit_id.clone(),
                        kit_name: Some(kit_name_str.to_string()),
                        id: format!("cmd-discovery:{}:{}", indexed.kit_id, indexed.def.id),
                        title: indexed.def.name.to_string(),
                        subtitle: Some(indexed.def.description.to_string()),
                        icon: Some(indexed.def.icon.clone()),
                        kind: ResultKind::Command {
                            kit_id: indexed.kit_id.clone(),
                            command_id: indexed.def.id.to_string(),
                            mode: indexed.def.mode.clone(),
                        },
                        accessories: Vec::new(),
                        actions: vec![super::KitAction::ActivateCommand {
                            kit_id: indexed.kit_id.clone(),
                            command_id: indexed.def.id.to_string(),
                        }],
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
    /// Whether the kit is enabled in the user's config.
    pub enabled: bool,
    /// Commands this kit provides.
    pub commands: Vec<CommandInfo>,
}

/// Command metadata sent to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub mode: CommandMode,
    /// Whether this command is enabled.
    pub enabled: bool,
    /// The default prefix from the kit code.
    pub default_prefix: Option<String>,
    /// The effective prefix (config override or default).
    pub effective_prefix: Option<String>,
    /// The effective hotkey (config override or default).
    pub effective_hotkey: Option<String>,
}

/// A command with a global hotkey, used by the shortcut registration layer.
#[derive(Debug, Clone)]
pub struct CommandHotkeyEntry {
    pub kit_id: String,
    pub command_id: String,
    pub mode: CommandMode,
    pub name: String,
    pub icon: Option<super::KitIcon>,
    pub hotkey: String,
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
    pub fn from_core_search(results: Vec<crate::search::SearchResult>) -> Vec<Self> {
        results.into_iter().map(|r| Self::from_core_result(r, 0)).collect()
    }

    /// Convert a single core file search result with its score.
    pub fn from_core_result(r: crate::search::SearchResult, score: u32) -> Self {
        let (kind, kind_str) = match r.kind {
            crate::indexer::EntryKind::File => (super::ResultKind::File, "file"),
            crate::indexer::EntryKind::Directory => (super::ResultKind::Directory, "directory"),
            crate::indexer::EntryKind::Application => {
                (super::ResultKind::Application, "application")
            }
        };

        let actions = build_core_actions(&r.path, &r.name, r.kind);

        Self {
            kit_id: "core".to_string(),
            kit_name: None,
            id: r.id,
            title: r.name,
            subtitle: Some(r.path),
            icon: Some(super::KitIcon::Named(kind_str.to_string())),
            kind,
            accessories: Vec::new(),
            actions,
            preview: None,
            score: Some(score),
        }
    }
}

/// Build the ordered action list for a core search result based on its kind.
fn build_core_actions(
    path: &str,
    name: &str,
    kind: crate::indexer::EntryKind,
) -> Vec<super::KitAction> {
    match kind {
        crate::indexer::EntryKind::File => {
            let mut actions = vec![super::KitAction::Open { target: path.to_owned() }];
            if is_text_file(name) {
                actions.push(super::KitAction::OpenInEditor { target: path.to_owned() });
            }
            actions.push(super::KitAction::RevealInFileManager { target: path.to_owned() });
            actions.push(super::KitAction::CopyPath { path: path.to_owned() });
            actions.push(super::KitAction::CopyName { name: name.to_owned() });
            actions.push(super::KitAction::Delete { target: path.to_owned() });
            actions
        }
        crate::indexer::EntryKind::Directory => {
            vec![
                super::KitAction::Open { target: path.to_owned() },
                super::KitAction::CopyPath { path: path.to_owned() },
                super::KitAction::CopyName { name: name.to_owned() },
                super::KitAction::Delete { target: path.to_owned() },
            ]
        }
        crate::indexer::EntryKind::Application => {
            vec![
                super::KitAction::Open { target: path.to_owned() },
                super::KitAction::RevealInFileManager { target: path.to_owned() },
            ]
        }
    }
}

/// Heuristic: consider a file "text/code" if its extension is in this set.
/// Binary/media files get fewer actions (no "Open in Editor").
#[allow(clippy::too_many_lines)]
fn is_text_file(name: &str) -> bool {
    let ext = match name.rsplit('.').next() {
        Some(e) => e.to_ascii_lowercase(),
        None => return false,
    };
    matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "markdown"
            | "rs"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "json"
            | "toml"
            | "yaml"
            | "yml"
            | "xml"
            | "html"
            | "htm"
            | "css"
            | "scss"
            | "less"
            | "py"
            | "rb"
            | "go"
            | "java"
            | "kt"
            | "kts"
            | "c"
            | "h"
            | "cpp"
            | "hpp"
            | "cc"
            | "cs"
            | "swift"
            | "m"
            | "mm"
            | "sh"
            | "bash"
            | "zsh"
            | "fish"
            | "ps1"
            | "bat"
            | "cmd"
            | "lua"
            | "vim"
            | "el"
            | "clj"
            | "cljs"
            | "ex"
            | "exs"
            | "erl"
            | "hs"
            | "ml"
            | "mli"
            | "r"
            | "sql"
            | "graphql"
            | "gql"
            | "proto"
            | "tf"
            | "hcl"
            | "dockerfile"
            | "makefile"
            | "cmake"
            | "conf"
            | "ini"
            | "cfg"
            | "env"
            | "gitignore"
            | "gitattributes"
            | "editorconfig"
            | "lock"
            | "log"
            | "csv"
            | "tsv"
            | "svg"
            | "tex"
            | "bib"
            | "rst"
            | "adoc"
            | "org"
            | "vue"
            | "svelte"
            | "astro"
            | "php"
            | "pl"
            | "pm"
            | "scala"
            | "sbt"
            | "dart"
            | "zig"
            | "nim"
            | "v"
            | "d"
            | "f90"
            | "f95"
            | "jl"
    )
}
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kits::{CommandDef, CommandMode, KitIcon, KitManifest, ResultKind};

    fn default_config() -> crate::config::FlintConfig {
        crate::config::FlintConfig::default()
    }

    fn cfg() -> crate::config::FlintConfig {
        default_config()
    }

    struct MockKit {
        manifest: KitManifest,
        cmds: Vec<CommandDef>,
        results: Vec<KitResult>,
    }

    impl MockKit {
        fn new(id: &'static str, cmds: Vec<CommandDef>) -> Self {
            Self {
                manifest: KitManifest {
                    id,
                    name: id,
                    description: "test kit",
                    icon: KitIcon::Emoji("🧪".to_string()),
                },
                cmds,
                results: Vec::new(),
            }
        }

        fn with_name(mut self, name: &'static str) -> Self {
            self.manifest.name = name;
            self
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

        fn commands(&self) -> Vec<CommandDef> {
            self.cmds.clone()
        }

        fn search(&self, _command_id: &str, _query: &str) -> Vec<KitResult> {
            self.results.clone()
        }
    }

    fn calc_command() -> CommandDef {
        CommandDef {
            id: "calculate",
            name: "Calculator",
            description: "Evaluate math",
            icon: KitIcon::Emoji("🧮".to_string()),
            mode: CommandMode::InputResults,
            default_prefix: Some("="),
            default_hotkey: None,
        }
    }

    fn make_result(id: &str, title: &str) -> KitResult {
        KitResult {
            id: id.to_string(),
            title: title.to_string(),
            subtitle: None,
            icon: None,
            kind: ResultKind::File,
            accessories: Vec::new(),
            actions: Vec::new(),
            preview: None,
            score: None,
        }
    }

    /// Helper: create registry, register a kit, return registry.
    fn reg_with(kit: MockKit) -> KitRegistry {
        let mut r = KitRegistry::new();
        r.register(Box::new(kit), &cfg());
        r
    }

    #[test]
    fn search_by_prefix_returns_none_when_no_kits_registered() {
        let registry = KitRegistry::new();
        assert!(registry.search_by_prefix("hello").is_none());
    }

    #[test]
    fn search_by_prefix_returns_none_when_no_prefix_matches() {
        let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        assert!(registry.search_by_prefix("hello").is_none());
    }

    #[test]
    fn search_by_prefix_dispatches_to_matching_command() {
        let kit =
            MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "42")]);
        let registry = reg_with(kit);

        let result = registry.search_by_prefix("= 2+3");
        assert!(result.is_some());
        let (kit_id, cmd_id, results) = result.unwrap();
        assert_eq!(kit_id, "calc");
        assert_eq!(cmd_id, "calculate");
        assert!(results.is_empty()); // not ready yet
    }

    #[test]
    fn search_by_prefix_returns_results_from_ready_kit() {
        let kit =
            MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "42")]);
        let mut registry = reg_with(kit);
        registry.states.insert("calc".to_string(), KitState::Ready);

        let result = registry.search_by_prefix("= 2+3");
        assert!(result.is_some());
        let (kit_id, _, results) = result.unwrap();
        assert_eq!(kit_id, "calc");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "42");
    }

    #[test]
    fn search_by_prefix_does_not_fallthrough_for_failed_kit() {
        let mut registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        registry.states.insert("calc".to_string(), KitState::Failed);

        let result = registry.search_by_prefix("= 2+3");
        assert!(result.is_some());
        let (_, _, results) = result.unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn first_matching_prefix_wins() {
        let mut registry = KitRegistry::new();
        registry.register(
            Box::new(
                MockKit::new("kit-a", vec![calc_command()])
                    .with_results(vec![make_result("a1", "from A")]),
            ),
            &cfg(),
        );
        let mut cmd = calc_command();
        cmd.id = "calc-b";
        registry.register(
            Box::new(
                MockKit::new("kit-b", vec![cmd]).with_results(vec![make_result("b1", "from B")]),
            ),
            &cfg(),
        );
        registry.states.insert("kit-a".to_string(), KitState::Ready);
        registry.states.insert("kit-b".to_string(), KitState::Ready);

        let (id, _, _) = registry.search_by_prefix("= test").unwrap();
        assert_eq!(id, "kit-a");
    }

    #[test]
    fn search_by_prefix_strips_prefix_and_space() {
        let kit =
            MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "5")]);
        let mut registry = reg_with(kit);
        registry.states.insert("calc".to_string(), KitState::Ready);

        assert!(registry.search_by_prefix("= 2+3").is_some());
        assert!(registry.search_by_prefix("=2+3").is_some());
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
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        });
    }

    #[test]
    fn shutdown_aborts_all_task_managers() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let mut registry = reg_with(MockKit::new("calc", vec![]));
            let mut tm = TaskManager::new();
            tm.spawn(async { tokio::time::sleep(std::time::Duration::from_secs(100)).await });
            registry.set_task_manager("calc", tm);
            registry.shutdown_all().await;
        });
    }

    #[test]
    fn register_sets_state_to_registered() {
        let registry = reg_with(MockKit::new("calc", vec![]));
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
        assert!(matches!(converted[0].kind, super::super::ResultKind::File));
    }

    #[test]
    fn from_core_search_encodes_kind_correctly() {
        let core = vec![crate::search::SearchResult {
            id: "/app/Slack".to_string(),
            name: "Slack".to_string(),
            path: "/app/Slack".to_string(),
            kind: crate::indexer::EntryKind::Application,
        }];
        let converted = KitSearchResult::from_core_search(core);
        assert!(matches!(converted[0].kind, super::super::ResultKind::Application));
    }

    #[test]
    fn from_kit_result_preserves_fields() {
        let result = make_result("r1", "Hello");
        let converted = KitSearchResult::from_kit_result("my-kit", "My Kit", result);
        assert_eq!(converted.kit_id, "my-kit");
        assert_eq!(converted.kit_name.as_deref(), Some("My Kit"));
        assert_eq!(converted.id, "r1");
        assert_eq!(converted.title, "Hello");
    }

    #[test]
    fn discovery_returns_matching_commands() {
        let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        let results = registry.discovery_results("calc");
        assert_eq!(results.len(), 1);
        let (score, result) = &results[0];
        assert_eq!(result.title, "Calculator");
        assert!(*score > 0);
        assert!(matches!(
            &result.kind,
            super::super::ResultKind::Command { kit_id, command_id, mode }
            if kit_id == "calc" && command_id == "calculate" && *mode == CommandMode::InputResults
        ));
    }

    #[test]
    fn discovery_is_case_insensitive() {
        let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        assert_eq!(registry.discovery_results("CALC").len(), 1);
        assert_eq!(registry.discovery_results("Calc").len(), 1);
    }

    #[test]
    fn discovery_returns_empty_for_no_match() {
        let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        assert!(registry.discovery_results("weather").is_empty());
    }

    #[test]
    fn discovery_skips_kits_without_commands() {
        let registry = reg_with(MockKit::new("chat-only", vec![]));
        assert!(registry.discovery_results("chat").is_empty());
    }

    #[test]
    fn discovery_matches_parent_kit_name() {
        // "Left Half" command won't match "window" by name, but its parent
        // kit "Window Management" should make it discoverable.
        let cmd = CommandDef {
            id: "left-half",
            name: "Left Half",
            description: "Tile left",
            icon: KitIcon::Emoji("◧".to_string()),
            mode: CommandMode::Execute,
            default_prefix: None,
            default_hotkey: None,
        };
        let registry = reg_with(MockKit::new("wm", vec![cmd]).with_name("Window Management"));
        let results = registry.discovery_results("window");
        assert_eq!(results.len(), 1, "should find 'Left Half' via kit name 'Window Management'");
        assert_eq!(results[0].1.title, "Left Half");
    }

    #[test]
    fn kit_infos_includes_commands() {
        let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        let infos = registry.kit_infos();
        assert_eq!(infos.len(), 1);
        assert_eq!(infos[0].commands.len(), 1);
        assert_eq!(infos[0].commands[0].id, "calculate");
        assert_eq!(infos[0].commands[0].effective_prefix.as_deref(), Some("="));
    }

    #[test]
    fn search_command_returns_results_for_valid_command() {
        let kit =
            MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "42")]);
        let mut registry = reg_with(kit);
        registry.states.insert("calc".to_string(), KitState::Ready);

        let results = registry.search_command("calc", "calculate", "2+3").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "42");
    }

    #[test]
    fn search_command_rejects_unknown_kit() {
        let registry = KitRegistry::new();
        assert!(registry.search_command("nonexistent", "calculate", "2+3").is_err());
    }

    #[test]
    fn search_command_rejects_unknown_command_id() {
        let mut registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        registry.states.insert("calc".to_string(), KitState::Ready);
        assert!(registry.search_command("calc", "nonexistent", "2+3").is_err());
    }

    #[test]
    fn execute_command_rejects_unknown_command_id() {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let mut registry = reg_with(MockKit::new("calc", vec![calc_command()]));
            registry.states.insert("calc".to_string(), KitState::Ready);
            assert!(registry.execute_command("calc", "nonexistent").await.is_err());
        });
    }

    #[test]
    fn disabled_kit_excluded_from_search_and_discovery() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "calc".to_string(),
            crate::config::KitConfig { enabled: false, ..Default::default() },
        );
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", vec![calc_command()])), &cfg);

        // Kit is registered but disabled — visible in settings, not in search.
        assert!(registry.search_by_prefix("= 2+3").is_none());
        assert!(registry.discovery_results("calc").is_empty());
        let infos = registry.kit_infos();
        assert_eq!(infos.len(), 1);
        assert!(!infos[0].enabled);
    }

    /// Mock kit that opts out of being enabled by default.
    struct DefaultDisabledKit(MockKit);

    #[async_trait::async_trait]
    impl Kit for DefaultDisabledKit {
        fn manifest(&self) -> &KitManifest {
            self.0.manifest()
        }
        fn default_enabled(&self) -> bool {
            false
        }
        fn commands(&self) -> Vec<CommandDef> {
            self.0.commands()
        }
    }

    #[test]
    fn default_disabled_kit_visible_in_settings_but_inactive() {
        let mut registry = KitRegistry::new();
        registry.register(
            Box::new(DefaultDisabledKit(MockKit::new("clip", vec![calc_command()]))),
            &cfg(),
        );
        // No config entry for "clip" → kit.default_enabled() returns false.
        // Kit shows in settings but is marked disabled.
        let infos = registry.kit_infos();
        assert_eq!(infos.len(), 1);
        assert!(!infos[0].enabled);
        // Disabled kit's commands don't appear in search/discovery.
        assert!(registry.search_by_prefix("= test").is_none());
        assert!(registry.discovery_results("calc").is_empty());
    }

    #[test]
    fn default_disabled_kit_active_when_config_enables() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "clip".to_string(),
            crate::config::KitConfig { enabled: true, ..Default::default() },
        );
        let mut registry = KitRegistry::new();
        registry.register(
            Box::new(DefaultDisabledKit(MockKit::new("clip", vec![calc_command()]))),
            &cfg,
        );
        let infos = registry.kit_infos();
        assert_eq!(infos.len(), 1);
        assert!(infos[0].enabled);
    }

    #[test]
    fn disabled_command_excluded_from_search_and_discovery() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "calc".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: {
                    let mut m = std::collections::HashMap::new();
                    m.insert(
                        "calculate".to_string(),
                        crate::config::CommandConfig { enabled: false, prefix: None, hotkey: None },
                    );
                    m
                },
                ..Default::default()
            },
        );
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", vec![calc_command()])), &cfg);
        registry.states.insert("calc".to_string(), KitState::Ready);

        assert!(registry.search_by_prefix("= 2+3").is_none());
        assert!(registry.discovery_results("calc").is_empty());
    }

    #[test]
    fn config_prefix_override_used_in_search() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "calc".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: {
                    let mut m = std::collections::HashMap::new();
                    m.insert(
                        "calculate".to_string(),
                        crate::config::CommandConfig {
                            enabled: true,
                            prefix: Some("//".to_string()),
                            hotkey: None,
                        },
                    );
                    m
                },
                ..Default::default()
            },
        );
        let kit =
            MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "5")]);
        let mut registry = KitRegistry::new();
        registry.register(Box::new(kit), &cfg);
        registry.states.insert("calc".to_string(), KitState::Ready);

        // Old prefix should not match
        assert!(registry.search_by_prefix("= 2+3").is_none());
        // New prefix should match
        assert!(registry.search_by_prefix("// 2+3").is_some());
    }

    #[test]
    fn commands_with_hotkeys_returns_empty_when_no_hotkeys() {
        let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
        assert!(registry.commands_with_hotkeys().is_empty());
    }

    #[test]
    fn commands_with_hotkeys_returns_command_with_default_hotkey() {
        let mut cmd = calc_command();
        cmd.default_hotkey = Some("CmdOrCtrl+=");
        let registry = reg_with(MockKit::new("calc", vec![cmd]));
        let entries = registry.commands_with_hotkeys();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].kit_id, "calc");
        assert_eq!(entries[0].command_id, "calculate");
        assert_eq!(entries[0].hotkey, "CmdOrCtrl+=");
        assert_eq!(entries[0].mode, CommandMode::InputResults);
    }

    #[test]
    fn config_hotkey_override_replaces_default() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "calc".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: {
                    let mut m = std::collections::HashMap::new();
                    m.insert(
                        "calculate".to_string(),
                        crate::config::CommandConfig {
                            enabled: true,
                            prefix: None,
                            hotkey: Some("Alt+C".to_string()),
                        },
                    );
                    m
                },
                ..Default::default()
            },
        );
        let mut cmd = calc_command();
        cmd.default_hotkey = Some("CmdOrCtrl+=");
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", vec![cmd])), &cfg);

        let entries = registry.commands_with_hotkeys();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].hotkey, "Alt+C");
    }

    #[test]
    fn config_hotkey_sets_hotkey_when_no_default() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "calc".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: {
                    let mut m = std::collections::HashMap::new();
                    m.insert(
                        "calculate".to_string(),
                        crate::config::CommandConfig {
                            enabled: true,
                            prefix: None,
                            hotkey: Some("CmdOrCtrl+=".to_string()),
                        },
                    );
                    m
                },
                ..Default::default()
            },
        );
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", vec![calc_command()])), &cfg);

        let entries = registry.commands_with_hotkeys();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].hotkey, "CmdOrCtrl+=");
    }

    #[test]
    fn disabled_command_excluded_from_hotkeys() {
        let mut cfg = default_config();
        cfg.kits.insert(
            "calc".to_string(),
            crate::config::KitConfig {
                enabled: true,
                commands: {
                    let mut m = std::collections::HashMap::new();
                    m.insert(
                        "calculate".to_string(),
                        crate::config::CommandConfig {
                            enabled: false,
                            prefix: None,
                            hotkey: Some("CmdOrCtrl+=".to_string()),
                        },
                    );
                    m
                },
                ..Default::default()
            },
        );
        let mut registry = KitRegistry::new();
        registry.register(Box::new(MockKit::new("calc", vec![calc_command()])), &cfg);
        assert!(registry.commands_with_hotkeys().is_empty());
    }

    #[test]
    fn kit_infos_includes_effective_hotkey() {
        let mut cmd = calc_command();
        cmd.default_hotkey = Some("CmdOrCtrl+=");
        let registry = reg_with(MockKit::new("calc", vec![cmd]));
        let infos = registry.kit_infos();
        assert_eq!(infos[0].commands[0].effective_hotkey.as_deref(), Some("CmdOrCtrl+="));
    }

    // ── Action Panel: core action list tests ──────────────────────

    #[test]
    fn text_file_result_has_six_actions_including_open_in_editor() {
        let core = vec![crate::search::SearchResult {
            id: "/tmp/hello.rs".to_string(),
            name: "hello.rs".to_string(),
            path: "/tmp/hello.rs".to_string(),
            kind: crate::indexer::EntryKind::File,
        }];
        let converted = KitSearchResult::from_core_search(core);
        let actions = &converted[0].actions;
        assert_eq!(actions.len(), 6, "text file should have 6 actions");
        assert!(matches!(&actions[0], super::super::KitAction::Open { .. }));
        assert!(matches!(&actions[1], super::super::KitAction::OpenInEditor { .. }));
        assert!(matches!(&actions[2], super::super::KitAction::RevealInFileManager { .. }));
        assert!(matches!(&actions[3], super::super::KitAction::CopyPath { .. }));
        assert!(matches!(&actions[4], super::super::KitAction::CopyName { .. }));
        assert!(matches!(&actions[5], super::super::KitAction::Delete { .. }));
    }

    #[test]
    fn binary_file_result_has_five_actions_without_open_in_editor() {
        let core = vec![crate::search::SearchResult {
            id: "/tmp/photo.png".to_string(),
            name: "photo.png".to_string(),
            path: "/tmp/photo.png".to_string(),
            kind: crate::indexer::EntryKind::File,
        }];
        let converted = KitSearchResult::from_core_search(core);
        let actions = &converted[0].actions;
        assert_eq!(actions.len(), 5, "binary file should have 5 actions (no Open in Editor)");
        assert!(matches!(&actions[0], super::super::KitAction::Open { .. }));
        assert!(matches!(&actions[1], super::super::KitAction::RevealInFileManager { .. }));
    }

    #[test]
    fn directory_result_has_four_actions() {
        let core = vec![crate::search::SearchResult {
            id: "/tmp/mydir".to_string(),
            name: "mydir".to_string(),
            path: "/tmp/mydir".to_string(),
            kind: crate::indexer::EntryKind::Directory,
        }];
        let converted = KitSearchResult::from_core_search(core);
        let actions = &converted[0].actions;
        assert_eq!(actions.len(), 4, "directory should have 4 actions");
        assert!(matches!(&actions[0], super::super::KitAction::Open { .. }));
        assert!(matches!(&actions[1], super::super::KitAction::CopyPath { .. }));
        assert!(matches!(&actions[2], super::super::KitAction::CopyName { .. }));
        assert!(matches!(&actions[3], super::super::KitAction::Delete { .. }));
    }

    #[test]
    fn application_result_has_two_actions() {
        let core = vec![crate::search::SearchResult {
            id: "/Applications/Safari.app".to_string(),
            name: "Safari".to_string(),
            path: "/Applications/Safari.app".to_string(),
            kind: crate::indexer::EntryKind::Application,
        }];
        let converted = KitSearchResult::from_core_search(core);
        let actions = &converted[0].actions;
        assert_eq!(actions.len(), 2, "application should have 2 actions");
        assert!(matches!(&actions[0], super::super::KitAction::Open { .. }));
        assert!(matches!(&actions[1], super::super::KitAction::RevealInFileManager { .. }));
    }

    #[test]
    fn is_text_file_detects_common_extensions() {
        assert!(super::is_text_file("main.rs"));
        assert!(super::is_text_file("index.tsx"));
        assert!(super::is_text_file("README.md"));
        assert!(super::is_text_file("config.toml"));
        assert!(super::is_text_file("styles.css"));
        assert!(super::is_text_file("Makefile.cmake"));
    }

    #[test]
    fn is_text_file_rejects_binary_extensions() {
        assert!(!super::is_text_file("photo.png"));
        assert!(!super::is_text_file("video.mp4"));
        assert!(!super::is_text_file("archive.zip"));
        assert!(!super::is_text_file("binary.exe"));
        assert!(!super::is_text_file("no_extension"));
    }

    #[test]
    fn is_text_file_is_case_insensitive() {
        assert!(super::is_text_file("FILE.RS"));
        assert!(super::is_text_file("README.MD"));
        assert!(super::is_text_file("config.JSON"));
    }

    #[test]
    fn copy_name_action_contains_filename_not_path() {
        let core = vec![crate::search::SearchResult {
            id: "/deep/nested/path/file.ts".to_string(),
            name: "file.ts".to_string(),
            path: "/deep/nested/path/file.ts".to_string(),
            kind: crate::indexer::EntryKind::File,
        }];
        let converted = KitSearchResult::from_core_search(core);
        let copy_name = converted[0]
            .actions
            .iter()
            .find(|a| matches!(a, super::super::KitAction::CopyName { .. }));
        assert!(copy_name.is_some());
        if let super::super::KitAction::CopyName { name } = copy_name.unwrap() {
            assert_eq!(name, "file.ts");
        }
    }
}
