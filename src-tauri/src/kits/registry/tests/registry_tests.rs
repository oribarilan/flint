//! Tests for registry lifecycle, search dispatch, prefix matching, and config overrides.

use crate::kits::registry::{KitRegistry, KitState, TaskManager};
use crate::kits::{CommandDef, CommandMode, KitIcon, KitManifest, KitResult, ResultKind};
use crate::kits::{Kit, KitSearchResult};

fn default_config() -> crate::config::FlintConfig {
    crate::config::FlintConfig::default()
}

fn cfg() -> crate::config::FlintConfig {
    default_config()
}

pub(super) struct MockKit {
    pub manifest: KitManifest,
    pub cmds: Vec<CommandDef>,
    pub results: Vec<KitResult>,
}

impl MockKit {
    pub fn new(id: &'static str, cmds: Vec<CommandDef>) -> Self {
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

    pub fn with_name(mut self, name: &'static str) -> Self {
        self.manifest.name = name;
        self
    }

    pub fn with_results(mut self, results: Vec<KitResult>) -> Self {
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

pub(super) fn calc_command() -> CommandDef {
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

pub(super) fn make_result(id: &str, title: &str) -> KitResult {
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
pub(super) fn reg_with(kit: MockKit) -> KitRegistry {
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
        Box::new(MockKit::new("kit-b", vec![cmd]).with_results(vec![make_result("b1", "from B")])),
        &cfg(),
    );
    registry.states.insert("kit-a".to_string(), KitState::Ready);
    registry.states.insert("kit-b".to_string(), KitState::Ready);

    let (id, _, _) = registry.search_by_prefix("= test").unwrap();
    assert_eq!(id, "kit-a");
}

#[test]
fn search_by_prefix_strips_prefix_and_space() {
    let kit = MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "5")]);
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
fn discovery_returns_matching_commands() {
    let registry = reg_with(MockKit::new("calc", vec![calc_command()]));
    let results = registry.discovery_results("calc");
    assert_eq!(results.len(), 1);
    let (score, result) = &results[0];
    assert_eq!(result.title, "Calculator");
    assert!(*score > 0);
    assert!(matches!(
        &result.kind,
        ResultKind::Command { kit_id, command_id, mode }
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
    registry
        .register(Box::new(DefaultDisabledKit(MockKit::new("clip", vec![calc_command()]))), &cfg());
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
    registry
        .register(Box::new(DefaultDisabledKit(MockKit::new("clip", vec![calc_command()]))), &cfg);
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
    let kit = MockKit::new("calc", vec![calc_command()]).with_results(vec![make_result("r1", "5")]);
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

#[test]
fn from_kit_result_preserves_fields() {
    let result = make_result("r1", "Hello");
    let converted = KitSearchResult::from_kit_result("my-kit", "My Kit", result);
    assert_eq!(converted.kit_id, "my-kit");
    assert_eq!(converted.kit_name.as_deref(), Some("My Kit"));
    assert_eq!(converted.id, "r1");
    assert_eq!(converted.title, "Hello");
}
