//! Application configuration backed by a TOML file.
//!
//! Reads from `~/.config/flint/config.toml`, falling back to compile-time
//! defaults for missing keys. The Settings UI writes changes via IPC.

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Config structs
// ---------------------------------------------------------------------------

/// Full application configuration.
#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct FlintConfig {
    pub general: GeneralConfig,
    pub search: SearchConfig,
    pub chat: ChatConfig,
}

/// General application settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct GeneralConfig {
    pub hotkey: String,
    pub launch_at_login: bool,
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

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

impl Default for GeneralConfig {
    fn default() -> Self {
        Self { hotkey: "CmdOrCtrl+Shift+Space".to_owned(), launch_at_login: false }
    }
}

impl Default for SearchConfig {
    fn default() -> Self {
        let mut directories =
            vec!["~/Desktop".to_owned(), "~/Documents".to_owned(), "~/Downloads".to_owned()];

        #[cfg(target_os = "macos")]
        directories.push("/Applications".to_owned());

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

fn config_base_dir() -> PathBuf {
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
}
