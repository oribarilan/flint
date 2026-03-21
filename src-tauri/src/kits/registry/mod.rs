//! Kit registry — manages kit lifecycle, command indexing, and search dispatch.

mod conversion;
mod discovery;
mod task_manager;

#[cfg(test)]
mod tests;

pub use task_manager::TaskManager;

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use super::{CommandDef, CommandMode, CommandOutput, Kit, KitContextBase, KitError, KitResult};

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
// Registry internals
// ---------------------------------------------------------------------------

/// Indexed command: command definition + owning kit id + effective config.
pub(super) struct IndexedCommand {
    pub(super) kit_id: String,
    pub(super) def: CommandDef,
    /// Whether this specific command is enabled (from config).
    pub(super) enabled: bool,
    /// Effective prefix: config override or default.
    pub(super) effective_prefix: Option<String>,
    /// Effective hotkey: config override or default.
    pub(super) effective_hotkey: Option<String>,
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// Central registry managing all kits, their state, and command dispatch.
pub struct KitRegistry {
    /// Registered kits by id.
    pub(super) kits: HashMap<String, Box<dyn Kit>>,
    /// Per-kit lifecycle state.
    pub(super) states: HashMap<String, KitState>,
    /// Per-kit enabled flag (disabled kits are visible in settings but inactive).
    enabled: HashMap<String, bool>,
    /// Per-kit background task managers.
    task_managers: HashMap<String, TaskManager>,
    /// All commands from all kits, with effective config baked in.
    pub(super) commands: Vec<IndexedCommand>,
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
    ///
    /// ## Delimiter-safe matching
    ///
    /// Kits that use a single-character prefix (e.g., `"="` for Calculator) are
    /// safe because the prefix is a symbol that would not otherwise start a normal
    /// search term.
    ///
    /// Kits that use a letter-based prefix **must** include a trailing space
    /// in their `default_prefix` (e.g., `"s "` for Sessions). This ensures that
    /// a user typing `"safari"` does **not** inadvertently activate the Sessions
    /// kit — `"safari".starts_with("s ")` is `false`. The trailing space acts as
    /// the required word-delimiter. The stripping logic below correctly handles
    /// this: after stripping the `"s "` prefix the remaining query is already
    /// the bare sub-query with no extra space to strip.
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

        // Strip the prefix.
        // For space-terminated prefixes (e.g. `"s "`), the space is already
        // consumed as part of `prefix_len` — there is no extra space to strip.
        // For symbol prefixes without a trailing space (e.g. `"="`), we strip
        // an optional following space so `"= 2+3"` and `"=2+3"` both work.
        let after_prefix = &query[prefix_len..];
        let effective_query = if matched.effective_prefix.as_ref().is_some_and(|p| p.ends_with(' '))
        {
            // Space-terminated prefix — sub-query starts immediately.
            after_prefix
        } else {
            // Symbol prefix — strip optional space for ergonomics.
            after_prefix.strip_prefix(' ').unwrap_or(after_prefix)
        };

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
}

impl Default for KitRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
