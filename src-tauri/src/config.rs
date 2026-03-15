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
    /// Per-kit configuration sections. Key = kit id.
    pub kits: HashMap<String, KitConfig>,
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
    pub directories: Vec<String>,
    pub exclude: Vec<String>,
    pub max_depth: usize,
}

/// AI chat settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct ChatConfig {
    pub default_model: String,
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
        let mut directories =
            vec!["~/Desktop".to_owned(), "~/Documents".to_owned(), "~/Downloads".to_owned()];

        #[cfg(target_os = "macos")]
        {
            directories.push("/Applications".to_owned());
            directories.push("/System/Applications".to_owned());
        }

        Self {
            directories,
            exclude: vec![
                "node_modules".to_owned(),
                ".git".to_owned(),
                "target".to_owned(),
                "__pycache__".to_owned(),
                ".Trash".to_owned(),
                "venv".to_owned(),
                "env".to_owned(),
                "bower_components".to_owned(),
            ],
            max_depth: 6,
        }
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
}
