//! Read and update project-level `OpenCode` config (`opencode.json`/`opencode.jsonc`).
//!
//! Flint launches `opencode serve` with cwd set to the second-brain repository,
//! so project-level `OpenCode` config in that repo is authoritative for model defaults.

use std::path::{Path, PathBuf};

use serde_json::Value;

/// Errors from `OpenCode` project config operations.
#[derive(Debug, thiserror::Error)]
pub enum OpenCodeProjectConfigError {
    #[error("repo path does not exist: {0}")]
    RepoNotFound(PathBuf),

    #[error("failed to read config '{path}': {source}")]
    Read { path: PathBuf, source: std::io::Error },

    #[error("failed to parse JSON config '{path}': {source}")]
    ParseJson { path: PathBuf, source: serde_json::Error },

    #[error("failed to parse JSONC config '{path}': {source}")]
    ParseJsonc { path: PathBuf, source: json5::Error },

    #[error("failed to write config '{path}': {source}")]
    Write { path: PathBuf, source: std::io::Error },

    #[error("failed to serialize config JSON: {0}")]
    Serialize(serde_json::Error),
}

/// Model config details from project config.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectModelConfig {
    /// Whether a project config file exists.
    pub exists: bool,
    /// Path used (preferred `opencode.jsonc`, fallback `opencode.json`).
    pub path: PathBuf,
    /// Whether the config currently has a non-empty `model` declaration.
    pub has_model: bool,
    /// Current model string (`provider/model`) if present.
    pub model: Option<String>,
}

/// Return project model config status for a repo.
pub fn get_project_model_config(
    repo_path: &Path,
) -> Result<ProjectModelConfig, OpenCodeProjectConfigError> {
    if !repo_path.is_dir() {
        return Err(OpenCodeProjectConfigError::RepoNotFound(repo_path.to_path_buf()));
    }

    let jsonc_path = repo_path.join("opencode.jsonc");
    let json_path = repo_path.join("opencode.json");

    let (path, exists) = if jsonc_path.exists() {
        (jsonc_path, true)
    } else if json_path.exists() {
        (json_path, true)
    } else {
        (jsonc_path, false)
    };

    if !exists {
        return Ok(ProjectModelConfig { exists: false, path, has_model: false, model: None });
    }

    let value = read_config_value(&path)?;
    let model = value
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);

    Ok(ProjectModelConfig { exists: true, path, has_model: model.is_some(), model })
}

/// Set or create project model declaration in `OpenCode` project config.
pub fn set_project_default_model(
    repo_path: &Path,
    model: &str,
) -> Result<(), OpenCodeProjectConfigError> {
    if !repo_path.is_dir() {
        return Err(OpenCodeProjectConfigError::RepoNotFound(repo_path.to_path_buf()));
    }

    let model = model.trim();
    if model.is_empty() {
        return Ok(());
    }

    let jsonc_path = repo_path.join("opencode.jsonc");
    let json_path = repo_path.join("opencode.json");
    let target_path = if jsonc_path.exists() {
        jsonc_path
    } else if json_path.exists() {
        json_path
    } else {
        jsonc_path
    };

    let mut value = if target_path.exists() {
        read_config_value(&target_path)?
    } else {
        let mut root = serde_json::Map::new();
        root.insert(
            "$schema".to_owned(),
            Value::String("https://opencode.ai/config.json".to_owned()),
        );
        Value::Object(root)
    };

    if !value.is_object() {
        // Preserve invalid/unexpected shape by replacing with a minimal object.
        let mut root = serde_json::Map::new();
        root.insert(
            "$schema".to_owned(),
            Value::String("https://opencode.ai/config.json".to_owned()),
        );
        value = Value::Object(root);
    }

    if let Value::Object(ref mut obj) = value {
        obj.insert("model".to_owned(), Value::String(model.to_owned()));
    }

    let serialized =
        serde_json::to_string_pretty(&value).map_err(OpenCodeProjectConfigError::Serialize)?;
    let with_trailing_newline = format!("{serialized}\n");
    std::fs::write(&target_path, with_trailing_newline)
        .map_err(|source| OpenCodeProjectConfigError::Write { path: target_path, source })
}

fn read_config_value(path: &Path) -> Result<Value, OpenCodeProjectConfigError> {
    let raw = std::fs::read_to_string(path)
        .map_err(|source| OpenCodeProjectConfigError::Read { path: path.to_path_buf(), source })?;

    // Try strict JSON first, then JSONC/JSON5.
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) => Ok(v),
        Err(json_err) => json5::from_str::<Value>(&raw).map_err(|source| {
            // If JSON parse failed and JSON5 failed too, report based on extension.
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                OpenCodeProjectConfigError::ParseJson { path: path.to_path_buf(), source: json_err }
            } else {
                OpenCodeProjectConfigError::ParseJsonc { path: path.to_path_buf(), source }
            }
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_missing_config_as_not_present() {
        let temp = tempfile::tempdir().expect("temp dir");
        let cfg = get_project_model_config(temp.path()).expect("config status");
        assert!(!cfg.exists);
        assert!(!cfg.has_model);
        assert_eq!(cfg.model, None);
        assert_eq!(cfg.path.file_name().and_then(|s| s.to_str()), Some("opencode.jsonc"));
    }

    #[test]
    fn reads_model_from_jsonc_with_comments() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("opencode.jsonc");
        std::fs::write(
            &path,
            r#"{
  // project config
  "$schema": "https://opencode.ai/config.json",
  "model": "github-copilot/claude-opus-4.6"
}
"#,
        )
        .expect("write config");

        let cfg = get_project_model_config(temp.path()).expect("config status");
        assert!(cfg.exists);
        assert!(cfg.has_model);
        assert_eq!(cfg.model.as_deref(), Some("github-copilot/claude-opus-4.6"));
    }

    #[test]
    fn creates_jsonc_with_model_when_missing() {
        let temp = tempfile::tempdir().expect("temp dir");
        set_project_default_model(temp.path(), "openai/gpt-5").expect("set model");

        let path = temp.path().join("opencode.jsonc");
        assert!(path.exists());
        let cfg = get_project_model_config(temp.path()).expect("config status");
        assert!(cfg.has_model);
        assert_eq!(cfg.model.as_deref(), Some("openai/gpt-5"));
    }

    #[test]
    fn updates_existing_json_model_field() {
        let temp = tempfile::tempdir().expect("temp dir");
        let path = temp.path().join("opencode.json");
        std::fs::write(
            &path,
            r#"{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/big-pickle"
}
"#,
        )
        .expect("write config");

        set_project_default_model(temp.path(), "github-copilot/gpt-5.3-codex").expect("set model");

        let cfg = get_project_model_config(temp.path()).expect("config status");
        assert_eq!(cfg.path.file_name().and_then(|s| s.to_str()), Some("opencode.json"));
        assert_eq!(cfg.model.as_deref(), Some("github-copilot/gpt-5.3-codex"));
    }
}
