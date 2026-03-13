//! Credential storage abstraction with build-profile–gated backends.
//!
//! - **Release** (`not(debug_assertions)`): OS keychain via the `keyring` crate.
//! - **Debug** (`debug_assertions`): Plain-text files at `~/.flint/dev-tokens/`.
//!
//! The debug backend avoids the repeated "wants to access your keychain"
//! prompts that macOS shows for unsigned (dev) binaries.

use std::sync::Once;

#[cfg(not(debug_assertions))]
const KEYRING_SERVICE: &str = "sh.oribi.flint";

static LOG_BACKEND: Once = Once::new();

/// Log which backend is active (once per process).
fn log_backend() {
    LOG_BACKEND.call_once(|| {
        #[cfg(debug_assertions)]
        tracing::info!("credential_store: using file-based backend (~/.flint/dev-tokens/)");

        #[cfg(not(debug_assertions))]
        tracing::info!("credential_store: using OS keychain");
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Load a credential by key. Returns `None` if not found or on error.
pub fn load(key: &str) -> Option<String> {
    log_backend();

    #[cfg(debug_assertions)]
    {
        file_backend::load(key)
    }

    #[cfg(not(debug_assertions))]
    {
        keychain_backend::load(key)
    }
}

/// Save a credential. Returns an error message on failure.
pub fn save(key: &str, value: &str) -> Result<(), String> {
    log_backend();

    #[cfg(debug_assertions)]
    {
        file_backend::save(key, value)
    }

    #[cfg(not(debug_assertions))]
    {
        keychain_backend::save(key, value)
    }
}

/// Delete a credential. Silently ignores missing keys.
pub fn delete(key: &str) {
    log_backend();

    #[cfg(debug_assertions)]
    {
        file_backend::delete(key);
    }

    #[cfg(not(debug_assertions))]
    {
        keychain_backend::delete(key);
    }
}

// ---------------------------------------------------------------------------
// Keychain backend (release builds)
// ---------------------------------------------------------------------------

#[cfg(not(debug_assertions))]
mod keychain_backend {
    use super::KEYRING_SERVICE;

    pub fn load(key: &str) -> Option<String> {
        keyring::Entry::new(KEYRING_SERVICE, key).ok().and_then(|entry| entry.get_password().ok())
    }

    pub fn save(key: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(KEYRING_SERVICE, key)
            .map_err(|e| e.to_string())?
            .set_password(value)
            .map_err(|e| e.to_string())
    }

    pub fn delete(key: &str) {
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, key) {
            let _ = entry.delete_credential();
        }
    }
}

// ---------------------------------------------------------------------------
// File backend (debug builds)
// ---------------------------------------------------------------------------

#[cfg(debug_assertions)]
mod file_backend {
    use std::fs;
    use std::path::PathBuf;

    /// Directory for dev-only token files.
    fn tokens_dir() -> PathBuf {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".flint/dev-tokens")
    }

    pub fn load(key: &str) -> Option<String> {
        let path = tokens_dir().join(key);
        fs::read_to_string(path).ok()
    }

    pub fn save(key: &str, value: &str) -> Result<(), String> {
        let dir = tokens_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

        let path = dir.join(key);
        fs::write(&path, value).map_err(|e| format!("write: {e}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&path, perms).map_err(|e| format!("chmod: {e}"))?;
        }

        Ok(())
    }

    pub fn delete(key: &str) {
        let path = tokens_dir().join(key);
        let _ = fs::remove_file(path);
    }
}

// ---------------------------------------------------------------------------
// Tests (debug file backend)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    /// Run tests against a temp directory instead of `~/.flint/dev-tokens/`.
    struct TempStore {
        dir: tempfile::TempDir,
    }

    impl TempStore {
        fn new() -> Self {
            Self { dir: tempfile::TempDir::new().unwrap() }
        }

        fn path(&self, key: &str) -> PathBuf {
            self.dir.path().join(key)
        }

        fn save(&self, key: &str, value: &str) -> Result<(), String> {
            let path = self.path(key);
            fs::create_dir_all(self.dir.path()).map_err(|e| format!("{e}"))?;
            fs::write(&path, value).map_err(|e| format!("{e}"))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                    .map_err(|e| format!("{e}"))?;
            }

            Ok(())
        }

        fn load(&self, key: &str) -> Option<String> {
            fs::read_to_string(self.path(key)).ok()
        }

        fn delete(&self, key: &str) {
            let _ = fs::remove_file(self.path(key));
        }
    }

    #[test]
    fn save_then_load_round_trip() {
        let store = TempStore::new();
        store.save("test_key", "secret_value").unwrap();
        assert_eq!(store.load("test_key"), Some("secret_value".to_string()));
    }

    #[test]
    fn delete_removes_file() {
        let store = TempStore::new();
        store.save("to_delete", "value").unwrap();
        assert!(store.path("to_delete").exists());

        store.delete("to_delete");
        assert!(!store.path("to_delete").exists());
    }

    #[test]
    fn load_returns_none_for_missing_key() {
        let store = TempStore::new();
        assert_eq!(store.load("nonexistent"), None);
    }

    #[test]
    #[cfg(unix)]
    fn file_permissions_are_0600() {
        use std::os::unix::fs::PermissionsExt;

        let store = TempStore::new();
        store.save("perm_test", "data").unwrap();

        let metadata = fs::metadata(store.path("perm_test")).unwrap();
        let mode = metadata.permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "expected 0600, got {mode:o}");
    }

    #[test]
    fn delete_nonexistent_is_noop() {
        let store = TempStore::new();
        store.delete("ghost"); // should not panic
    }
}
