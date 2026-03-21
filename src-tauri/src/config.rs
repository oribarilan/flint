//! Application configuration backed by a TOML file.
//!
//! Reads from `~/.config/flint/config.toml`, falling back to compile-time
//! defaults for missing keys. The Settings UI writes changes via IPC.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Config structs
// ---------------------------------------------------------------------------

/// Full application configuration.
#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct FlintConfig {
    pub general: GeneralConfig,
    pub appearance: AppearanceConfig,
    pub search: SearchConfig,
    pub chat: ChatConfig,
    pub second_brain: SecondBrainConfig,
    /// Per-kit configuration sections. Key = kit id.
    pub kits: HashMap<String, KitConfig>,
    /// List of `OpenCode` servers to monitor for session status.
    #[serde(default)]
    pub monitored_servers: Vec<MonitoredServerConfig>,
}

/// General application settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct GeneralConfig {
    pub hotkey: String,
    pub launch_at_login: bool,
    /// Default terminal command. `"auto"` = detect from environment.
    pub terminal: String,
    /// Default editor command. `"auto"` = detect from environment.
    pub editor: String,
}

/// Appearance settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct AppearanceConfig {
    /// Font size preset: "extra-small", "small", "medium", or "large".
    pub font_size: String,
    /// Color theme: "system" (follows OS), "flint" (dark), or "flint-light".
    pub theme: String,
    /// Whether to apply backdrop blur on the launcher overlay.
    pub backdrop_blur: bool,
}

/// File search settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct SearchConfig {
    /// Directories to scope file search to. Default: home directory.
    pub directories: Vec<String>,
    /// Deprecated: exclusions are handled by the OS search backend (Spotlight).
    /// Kept for config file backward compatibility — existing TOML files with
    /// this field will still parse without error.
    pub exclude: Vec<String>,
    /// Deprecated: depth is handled by the OS search backend (Spotlight).
    /// Kept for config file backward compatibility.
    pub max_depth: usize,
}

/// AI chat settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ChatConfig {
    pub default_model: String,
}

/// Second brain configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
#[derive(Default)]
pub struct SecondBrainConfig {
    /// Absolute path to the local second brain git repo.
    pub repo_path: Option<String>,
}

/// Configuration entry for a single monitored `OpenCode` server.
///
/// Each entry targets one running `opencode serve` process that Flint will
/// subscribe to via SSE for session-status monitoring.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MonitoredServerConfig {
    /// Stable, user-assigned identifier — must be unique across all entries.
    pub id: String,
    /// Hostname or IP address of the server (e.g. `"127.0.0.1"`, `"192.168.1.10"`).
    pub host: String,
    /// TCP port the server is listening on (1–65535).
    pub port: u16,
    /// Optional human-readable label shown in the Sessions kit UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl MonitoredServerConfig {
    /// Base URL for this server (e.g. `http://127.0.0.1:14097`).
    pub fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    /// Display name: label if set, otherwise `"<host>:<port>"`.
    pub fn display_name(&self) -> String {
        self.label.clone().unwrap_or_else(|| format!("{}:{}", self.host, self.port))
    }
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/// Errors returned when validating monitored-server configuration.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MonitoredServerConfigError {
    #[error("too many monitored servers: got {actual}, max is {max}")]
    TooManyServers { max: usize, actual: usize },

    #[error("server id is empty or whitespace-only (index {index})")]
    EmptyId { index: usize },

    #[error("duplicate server id \"{id}\"")]
    DuplicateId { id: String },

    #[error("duplicate host+port combination \"{host}:{port}\"")]
    DuplicateHostPort { host: String, port: u16 },

    #[error("invalid port 0 for server \"{id}\" — ports must be in range 1–65535")]
    ZeroPort { id: String },

    #[error("empty host for server \"{id}\"")]
    EmptyHost { id: String },
}

/// Hard cap for monitored servers in runtime configuration.
pub const MAX_MONITORED_SERVERS: usize = 10;

/// Return a sanitized server list suitable for runtime monitor startup.
///
/// Rules:
/// - Trim whitespace from `id` and `host`.
/// - Drop invalid entries (empty id/host, port=0).
/// - Keep first occurrence for duplicate ids and host+port tuples.
/// - Enforce [`MAX_MONITORED_SERVERS`] cap.
pub fn sanitize_monitored_servers(servers: &[MonitoredServerConfig]) -> Vec<MonitoredServerConfig> {
    use std::collections::HashSet;

    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut seen_host_ports: HashSet<(String, u16)> = HashSet::new();
    let mut out = Vec::new();

    for server in servers {
        if out.len() >= MAX_MONITORED_SERVERS {
            break;
        }

        let id = server.id.trim().to_string();
        let host = server.host.trim().to_string();
        let port = server.port;

        if id.is_empty() || host.is_empty() || port == 0 {
            continue;
        }

        if !seen_ids.insert(id.clone()) {
            continue;
        }

        if !seen_host_ports.insert((host.clone(), port)) {
            continue;
        }

        out.push(MonitoredServerConfig {
            id,
            host,
            port,
            label: server.label.clone().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        });
    }

    out
}

/// Validate the list of monitored-server entries for duplicates and invalid values.
///
/// Returns all validation errors found (not just the first).
pub fn validate_monitored_servers(
    servers: &[MonitoredServerConfig],
) -> Vec<MonitoredServerConfigError> {
    use std::collections::HashSet;

    let mut errors = Vec::new();
    let mut seen_ids: HashSet<&str> = HashSet::new();
    let mut seen_host_ports: HashSet<(&str, u16)> = HashSet::new();

    if servers.len() > MAX_MONITORED_SERVERS {
        errors.push(MonitoredServerConfigError::TooManyServers {
            max: MAX_MONITORED_SERVERS,
            actual: servers.len(),
        });
    }

    for (index, server) in servers.iter().enumerate() {
        // Blank / whitespace-only ID
        if server.id.trim().is_empty() {
            errors.push(MonitoredServerConfigError::EmptyId { index });
            continue; // skip further checks — we have no valid ID to key on
        }

        // Duplicate ID
        if !seen_ids.insert(server.id.as_str()) {
            errors.push(MonitoredServerConfigError::DuplicateId { id: server.id.clone() });
        }

        // Zero port (port = 0 is reserved / invalid for a real server)
        if server.port == 0 {
            errors.push(MonitoredServerConfigError::ZeroPort { id: server.id.clone() });
        }

        // Empty host
        if server.host.trim().is_empty() {
            errors.push(MonitoredServerConfigError::EmptyHost { id: server.id.clone() });
        }

        // Duplicate host+port (only when both fields are otherwise valid)
        if server.port != 0 && !server.host.trim().is_empty() {
            let key = (server.host.as_str(), server.port);
            if !seen_host_ports.insert(key) {
                errors.push(MonitoredServerConfigError::DuplicateHostPort {
                    host: server.host.clone(),
                    port: server.port,
                });
            }
        }
    }

    errors
}

/// Per-kit configuration.
///
/// Each kit has at minimum an `enabled` flag. Per-command overrides
/// (enabled, prefix) are stored in the `commands` map.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct KitConfig {
    /// Whether the kit is active. Disabled kits produce no results.
    pub enabled: bool,
    /// Per-command overrides, keyed by command id.
    pub commands: HashMap<String, CommandConfig>,
    /// Kit-specific settings (opaque to the core).
    #[serde(flatten)]
    pub extra: HashMap<String, toml::Value>,
}

/// Per-command configuration overrides.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct CommandConfig {
    /// Whether this command is active.
    pub enabled: bool,
    /// Custom prefix override (replaces the kit's default).
    pub prefix: Option<String>,
    /// Custom hotkey override (replaces the kit's default).
    pub hotkey: Option<String>,
}

impl Default for CommandConfig {
    fn default() -> Self {
        Self { enabled: true, prefix: None, hotkey: None }
    }
}

impl Default for KitConfig {
    fn default() -> Self {
        Self { enabled: true, commands: HashMap::new(), extra: HashMap::new() }
    }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            hotkey: "CmdOrCtrl+Shift+Space".to_owned(),
            launch_at_login: false,
            terminal: "auto".to_owned(),
            editor: "auto".to_owned(),
        }
    }
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self { font_size: "small".to_owned(), theme: "flint".to_owned(), backdrop_blur: false }
    }
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self { directories: vec!["~".to_owned()], exclude: Vec::new(), max_depth: 10 }
    }
}

impl Default for ChatConfig {
    fn default() -> Self {
        Self { default_model: "gpt-4.1".to_owned() }
    }
}

// ---------------------------------------------------------------------------
// Managed state
// ---------------------------------------------------------------------------

/// Thread-safe config wrapper for Tauri managed state.
#[derive(Clone)]
pub struct AppConfig(Arc<RwLock<FlintConfig>>);

impl AppConfig {
    /// Wrap an already-loaded config for state management.
    pub fn new(config: FlintConfig) -> Self {
        Self(Arc::new(RwLock::new(config)))
    }

    /// Read the current config.
    pub fn get(&self) -> FlintConfig {
        self.0.read().expect("config lock poisoned").clone()
    }

    /// Replace the config and persist to disk.
    pub fn update(&self, new_config: FlintConfig) -> Result<(), ConfigError> {
        save_to_disk(&new_config)?;
        *self.0.write().expect("config lock poisoned") = new_config;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors that can occur while reading or writing the config file.
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to write config: {0}")]
    Write(String),
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/// Config file path: `~/.config/flint/config.toml` (Unix) or
/// `%APPDATA%\flint\config.toml` (Windows).
fn config_path() -> PathBuf {
    config_base_dir().join("flint").join("config.toml")
}

pub fn config_base_dir() -> PathBuf {
    #[cfg(unix)]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|h| h.join(".config")))
            .unwrap_or_else(|| PathBuf::from(".config"))
    }
    #[cfg(windows)]
    {
        dirs::config_dir().unwrap_or_else(|| PathBuf::from(".config"))
    }
}

/// Load config from disk, falling back to defaults for missing keys.
pub fn load_or_default() -> FlintConfig {
    let path = config_path();
    let Ok(contents) = std::fs::read_to_string(&path) else {
        tracing::info!(path = %path.display(), "no config file found, using defaults");
        return FlintConfig::default();
    };
    match toml::from_str(&contents) {
        Ok(config) => {
            tracing::info!(path = %path.display(), "config loaded");
            config
        }
        Err(e) => {
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "failed to parse config, using defaults"
            );
            FlintConfig::default()
        }
    }
}

fn save_to_disk(config: &FlintConfig) -> Result<(), ConfigError> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| ConfigError::Write(e.to_string()))?;
    }
    let toml_str = toml::to_string_pretty(config).map_err(|e| ConfigError::Write(e.to_string()))?;
    std::fs::write(&path, toml_str).map_err(|e| ConfigError::Write(e.to_string()))?;
    tracing::info!(path = %path.display(), "config saved");
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_use_defaults_for_empty_config() {
        let config: FlintConfig = toml::from_str("").unwrap();
        assert_eq!(config, FlintConfig::default());
    }

    #[test]
    fn should_parse_partial_config_chat_only() {
        let toml_str = r#"
[chat]
default_model = "claude-sonnet-4"
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.chat.default_model, "claude-sonnet-4");
        assert_eq!(config.general, GeneralConfig::default());
        assert_eq!(config.appearance, AppearanceConfig::default());
        assert_eq!(config.search, SearchConfig::default());
    }

    #[test]
    fn should_round_trip_config() {
        let original = FlintConfig::default();
        let toml_str = toml::to_string_pretty(&original).unwrap();
        let parsed: FlintConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(original, parsed);
    }

    #[test]
    fn should_parse_full_config() {
        let toml_str = r#"
[general]
hotkey = "Ctrl+Space"
launch_at_login = true

[appearance]
font_size = "large"
theme = "flint-light"

[search]
directories = ["~/Projects"]
exclude = [".git"]
max_depth = 3

[chat]
default_model = "gpt-4o"
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.general.hotkey, "Ctrl+Space");
        assert!(config.general.launch_at_login);
        assert_eq!(config.appearance.font_size, "large");
        assert_eq!(config.appearance.theme, "flint-light");
        assert_eq!(config.search.directories, vec!["~/Projects"]);
        assert_eq!(config.search.exclude, vec![".git"]);
        assert_eq!(config.search.max_depth, 3);
        assert_eq!(config.chat.default_model, "gpt-4o");
    }

    #[test]
    fn should_preserve_defaults_for_missing_keys_in_section() {
        let toml_str = r#"
[general]
hotkey = "Alt+Space"
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.general.hotkey, "Alt+Space");
        assert!(!config.general.launch_at_login);
    }

    #[test]
    fn should_default_theme_when_missing() {
        let toml_str = r#"
[appearance]
font_size = "large"
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.appearance.font_size, "large");
        assert_eq!(config.appearance.theme, "flint");
    }

    #[test]
    fn should_save_and_load_from_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("config.toml");

        let config = FlintConfig {
            chat: ChatConfig { default_model: "test-model".to_owned() },
            ..FlintConfig::default()
        };

        let toml_str = toml::to_string_pretty(&config).unwrap();
        std::fs::write(&path, &toml_str).unwrap();

        let contents = std::fs::read_to_string(&path).unwrap();
        let loaded: FlintConfig = toml::from_str(&contents).unwrap();
        assert_eq!(loaded, config);
    }

    #[test]
    fn should_parse_kit_config_sections() {
        let toml_str = r#"
[kits.calculator]
enabled = true

[kits.clipboard]
enabled = true
max_history = 200

[kits.stocks]
enabled = false
watchlist = ["AAPL", "GOOGL"]
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.kits.len(), 3);

        let calc = &config.kits["calculator"];
        assert!(calc.enabled);

        let clip = &config.kits["clipboard"];
        assert!(clip.enabled);
        assert_eq!(clip.extra["max_history"], toml::Value::Integer(200));

        let stocks = &config.kits["stocks"];
        assert!(!stocks.enabled);
    }

    #[test]
    fn should_default_to_empty_kits() {
        let config: FlintConfig = toml::from_str("").unwrap();
        assert!(config.kits.is_empty());
    }

    #[test]
    fn should_parse_command_hotkey_override() {
        let toml_str = r#"
[kits.calculator]
enabled = true

[kits.calculator.commands.calculate]
enabled = true
prefix = "="
hotkey = "CmdOrCtrl+="
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        let calc = &config.kits["calculator"];
        let cmd = &calc.commands["calculate"];
        assert!(cmd.enabled);
        assert_eq!(cmd.prefix.as_deref(), Some("="));
        assert_eq!(cmd.hotkey.as_deref(), Some("CmdOrCtrl+="));
    }

    #[test]
    fn command_config_defaults_hotkey_to_none() {
        let config = CommandConfig::default();
        assert!(config.hotkey.is_none());
    }

    #[test]
    fn general_config_defaults_terminal_and_editor_to_auto() {
        let config = GeneralConfig::default();
        assert_eq!(config.terminal, "auto");
        assert_eq!(config.editor, "auto");
    }

    #[test]
    fn should_parse_terminal_and_editor_config() {
        let toml_str = r#"
[general]
terminal = "warp"
editor = "code"
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.general.terminal, "warp");
        assert_eq!(config.general.editor, "code");
    }

    #[test]
    fn should_default_terminal_and_editor_when_missing() {
        let toml_str = r#"
[general]
hotkey = "Alt+Space"
"#;
        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.general.terminal, "auto");
        assert_eq!(config.general.editor, "auto");
    }

    #[test]
    fn should_round_trip_terminal_and_editor() {
        let mut config = FlintConfig::default();
        config.general.terminal = "alacritty".to_owned();
        config.general.editor = "nvim".to_owned();
        let toml_str = toml::to_string_pretty(&config).unwrap();
        let parsed: FlintConfig = toml::from_str(&toml_str).unwrap();
        assert_eq!(parsed.general.terminal, "alacritty");
        assert_eq!(parsed.general.editor, "nvim");
    }

    #[test]
    fn should_parse_monitored_servers_config() {
        let toml_str = r#"
[[monitored_servers]]
id = "local"
host = "127.0.0.1"
port = 14097
label = "Work"

[[monitored_servers]]
id = "remote"
host = "192.168.1.10"
port = 14098
"#;

        let config: FlintConfig = toml::from_str(toml_str).unwrap();
        assert_eq!(config.monitored_servers.len(), 2);
        assert_eq!(config.monitored_servers[0].id, "local");
        assert_eq!(config.monitored_servers[0].host, "127.0.0.1");
        assert_eq!(config.monitored_servers[0].port, 14097);
        assert_eq!(config.monitored_servers[0].label.as_deref(), Some("Work"));
        assert_eq!(config.monitored_servers[1].label, None);
    }

    #[test]
    fn validate_monitored_servers_detects_duplicate_id() {
        let servers = vec![
            MonitoredServerConfig {
                id: "s1".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14097,
                label: None,
            },
            MonitoredServerConfig {
                id: "s1".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14098,
                label: None,
            },
        ];

        let errors = validate_monitored_servers(&servers);
        assert!(errors
            .iter()
            .any(|e| matches!(e, MonitoredServerConfigError::DuplicateId { id } if id == "s1")));
    }

    #[test]
    fn validate_monitored_servers_detects_duplicate_host_port() {
        let servers = vec![
            MonitoredServerConfig {
                id: "s1".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14097,
                label: None,
            },
            MonitoredServerConfig {
                id: "s2".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14097,
                label: None,
            },
        ];

        let errors = validate_monitored_servers(&servers);
        assert!(errors.iter().any(|e| matches!(
            e,
            MonitoredServerConfigError::DuplicateHostPort { host, port }
                if host == "127.0.0.1" && *port == 14097
        )));
    }

    #[test]
    fn validate_monitored_servers_detects_empty_and_zero_port() {
        let servers = vec![MonitoredServerConfig {
            id: " ".to_string(),
            host: " ".to_string(),
            port: 0,
            label: None,
        }];

        let errors = validate_monitored_servers(&servers);
        assert!(errors
            .iter()
            .any(|e| matches!(e, MonitoredServerConfigError::EmptyId { index } if *index == 0)));
    }

    #[test]
    fn validate_monitored_servers_detects_too_many_servers() {
        let servers: Vec<MonitoredServerConfig> = (0..=MAX_MONITORED_SERVERS)
            .map(|i| MonitoredServerConfig {
                id: format!("s{i}"),
                host: "127.0.0.1".to_string(),
                port: 15000 + u16::try_from(i).unwrap_or(0),
                label: None,
            })
            .collect();

        let errors = validate_monitored_servers(&servers);
        assert!(errors.iter().any(|e| matches!(
            e,
            MonitoredServerConfigError::TooManyServers { max, actual }
                if *max == MAX_MONITORED_SERVERS && *actual == MAX_MONITORED_SERVERS + 1
        )));
    }

    #[test]
    fn sanitize_monitored_servers_drops_invalid_and_duplicates() {
        let servers = vec![
            MonitoredServerConfig {
                id: " s1 ".to_string(),
                host: " 127.0.0.1 ".to_string(),
                port: 14097,
                label: Some(" Local ".to_string()),
            },
            MonitoredServerConfig {
                id: "s1".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14098,
                label: None,
            },
            MonitoredServerConfig {
                id: "s2".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14097,
                label: None,
            },
            MonitoredServerConfig {
                id: " ".to_string(),
                host: "127.0.0.1".to_string(),
                port: 14099,
                label: None,
            },
        ];

        let sanitized = sanitize_monitored_servers(&servers);
        assert_eq!(sanitized.len(), 1);
        assert_eq!(sanitized[0].id, "s1");
        assert_eq!(sanitized[0].host, "127.0.0.1");
        assert_eq!(sanitized[0].label.as_deref(), Some("Local"));
    }

    #[test]
    fn sanitize_monitored_servers_enforces_max_cap() {
        let servers: Vec<MonitoredServerConfig> = (0..(MAX_MONITORED_SERVERS + 5))
            .map(|i| MonitoredServerConfig {
                id: format!("s{i}"),
                host: format!("127.0.0.{}", (i % 200) + 1),
                port: 15000 + u16::try_from(i).unwrap_or(0),
                label: None,
            })
            .collect();

        let sanitized = sanitize_monitored_servers(&servers);
        assert_eq!(sanitized.len(), MAX_MONITORED_SERVERS);
    }
}
