//! File system indexer for the launcher.
//!
//! On macOS, delegates to Spotlight (`mdfind`) for both app discovery
//! and file search. Preloaded apps are stored in [`AppIndex`] for
//! instant fuzzy matching; file search is per-keystroke via Spotlight.

#[cfg(target_os = "macos")]
pub mod spotlight;

use std::path::Path;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// The kind of indexed entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    /// A regular file.
    File,
    /// A directory (non-application).
    Directory,
    /// A macOS `.app` bundle.
    Application,
}

/// A single indexed file-system entry.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileEntry {
    /// Absolute path.
    pub path: String,
    /// Display name (`.app` extension stripped for applications).
    pub name: String,
    /// Entry kind.
    pub kind: EntryKind,
    /// Lower-cased display name, cached for matching.
    pub lowercase_name: String,
}

/// Preloaded application index, stored as Tauri managed state.
///
/// Populated once at startup via Spotlight's app discovery. Typically
/// contains ~400 entries and is small enough to score with nucleo on
/// every keystroke (<1ms).
pub struct AppIndex(pub Vec<FileEntry>);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Create a `FileEntry` from raw path metadata.
///
/// Used by the Spotlight module to create entries from `mdfind` output
/// paths without going through `walkdir`.
pub fn entry_from_path(path: &Path) -> Option<FileEntry> {
    let raw_name = path.file_name()?.to_string_lossy().into_owned();
    let is_dir = path.is_dir();
    let (name, kind) = classify_path(&raw_name, is_dir);
    let lowercase_name = name.to_lowercase();
    Some(FileEntry { path: path.to_string_lossy().into_owned(), name, kind, lowercase_name })
}

/// Classify a path as file, directory, or macOS application.
///
/// On macOS, directories ending in `.app` are classified as `Application`
/// with the display name stripped of the `.app` suffix. This is the
/// single source of truth for entry classification.
pub fn classify_path(name: &str, is_dir: bool) -> (String, EntryKind) {
    #[cfg(target_os = "macos")]
    if is_dir {
        if let Some(ext) = Path::new(name).extension() {
            if ext.eq_ignore_ascii_case("app") {
                let display = name.strip_suffix(".app").unwrap_or(name);
                return (display.to_owned(), EntryKind::Application);
            }
        }
    }

    if is_dir {
        (name.to_owned(), EntryKind::Directory)
    } else {
        (name.to_owned(), EntryKind::File)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // ── entry_from_path ───────────────────────────────────────

    #[test]
    fn entry_from_path_creates_file_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("test.txt");
        fs::write(&file, "hello").unwrap();

        let entry = entry_from_path(&file).unwrap();
        assert_eq!(entry.name, "test.txt");
        assert_eq!(entry.kind, EntryKind::File);
        assert_eq!(entry.lowercase_name, "test.txt");
        assert!(entry.path.ends_with("test.txt"));
    }

    #[test]
    fn entry_from_path_creates_directory_entry() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("mydir");
        fs::create_dir(&dir).unwrap();

        let entry = entry_from_path(&dir).unwrap();
        assert_eq!(entry.name, "mydir");
        assert_eq!(entry.kind, EntryKind::Directory);
    }

    #[test]
    fn entry_from_path_returns_none_for_root() {
        let result = entry_from_path(Path::new("/"));
        assert!(result.is_none());
    }

    #[test]
    fn entry_from_path_app_on_macos() {
        let tmp = tempfile::tempdir().unwrap();
        let app = tmp.path().join("Cool.app");
        fs::create_dir(&app).unwrap();

        let entry = entry_from_path(&app).unwrap();
        if cfg!(target_os = "macos") {
            assert_eq!(entry.name, "Cool");
            assert_eq!(entry.kind, EntryKind::Application);
            assert_eq!(entry.lowercase_name, "cool");
        } else {
            assert_eq!(entry.name, "Cool.app");
            assert_eq!(entry.kind, EntryKind::Directory);
        }
    }

    #[test]
    fn entry_from_path_stores_absolute_path() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("abs.txt");
        fs::write(&file, "data").unwrap();

        let entry = entry_from_path(&file).unwrap();
        assert!(
            entry.path.starts_with('/') || entry.path.contains(':'),
            "path should be absolute, got: {}",
            entry.path
        );
    }

    #[test]
    fn entry_from_path_lowercases_name() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("README.md");
        fs::write(&file, "").unwrap();

        let entry = entry_from_path(&file).unwrap();
        assert_eq!(entry.name, "README.md");
        assert_eq!(entry.lowercase_name, "readme.md");
    }

    // ── classify_path ─────────────────────────────────────────

    #[test]
    fn classify_path_file() {
        let (name, kind) = classify_path("readme.txt", false);
        assert_eq!(name, "readme.txt");
        assert_eq!(kind, EntryKind::File);
    }

    #[test]
    fn classify_path_directory() {
        let (name, kind) = classify_path("mydir", true);
        assert_eq!(name, "mydir");
        assert_eq!(kind, EntryKind::Directory);
    }

    #[test]
    fn classify_path_app_on_macos() {
        let (name, kind) = classify_path("Cool.app", true);
        if cfg!(target_os = "macos") {
            assert_eq!(name, "Cool");
            assert_eq!(kind, EntryKind::Application);
        } else {
            assert_eq!(name, "Cool.app");
            assert_eq!(kind, EntryKind::Directory);
        }
    }

    #[test]
    fn classify_path_app_file_not_promoted() {
        let (name, kind) = classify_path("Cool.app", false);
        assert_eq!(name, "Cool.app");
        assert_eq!(kind, EntryKind::File);
    }
}
