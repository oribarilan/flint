//! File system indexer for the launcher.
//!
//! Walks user directories (and `/Applications` on macOS) in parallel,
//! collecting [`FileEntry`] items into a thread-safe [`FileIndex`] that
//! is stored as Tauri managed state.

use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Instant;

use rayon::prelude::*;
use walkdir::WalkDir;

/// Directories under `$HOME` to index.
const HOME_DIRS: &[&str] = &["Desktop", "Documents", "Downloads"];

/// Directory names to skip entirely.
const EXCLUDED_DIRS: &[&str] = &["node_modules", ".git", "target", "__pycache__", ".Trash"];

/// Maximum directory depth to walk.
const MAX_DEPTH: usize = 6;

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
#[derive(Debug, Clone)]
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

/// Thread-safe wrapper around the entry list, stored as Tauri managed state.
pub struct FileIndex(pub Arc<RwLock<Vec<FileEntry>>>);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Build the file index by walking all configured directories in parallel.
///
/// Returns the collected entries. Logs elapsed time via `tracing`.
pub fn build_index() -> Vec<FileEntry> {
    let start = Instant::now();

    let mut roots = home_roots();
    append_platform_roots(&mut roots);

    let entries: Vec<FileEntry> = roots.par_iter().flat_map(|root| walk_directory(root)).collect();

    let duration = start.elapsed();
    tracing::info!("Indexed {} files in {duration:?}", entries.len());

    entries
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/// Resolve `~/Desktop`, `~/Documents`, `~/Downloads`.
fn home_roots() -> Vec<PathBuf> {
    let Some(home) = home_dir() else {
        tracing::warn!("Could not determine home directory; skipping user dirs");
        return Vec::new();
    };

    HOME_DIRS.iter().map(|d| home.join(d)).filter(|p| p.is_dir()).collect()
}

/// Append platform-specific root directories.
fn append_platform_roots(roots: &mut Vec<PathBuf>) {
    #[cfg(target_os = "macos")]
    {
        let apps = PathBuf::from("/Applications");
        if apps.is_dir() {
            roots.push(apps);
        }
    }
}

/// Walk a single root directory and return all matching entries.
fn walk_directory(root: &Path) -> Vec<FileEntry> {
    WalkDir::new(root)
        .max_depth(MAX_DEPTH)
        .into_iter()
        .filter_entry(|e| !is_excluded(e))
        .filter_map(std::result::Result::ok)
        .filter_map(|entry| to_file_entry(&entry, root))
        .collect()
}

/// Decide whether a `walkdir` entry should be excluded.
fn is_excluded(entry: &walkdir::DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();

    // Skip hidden directories/files (starting with `.`), except the root itself.
    if entry.depth() > 0 && name.starts_with('.') {
        return true;
    }

    // Skip known noisy directories.
    if entry.file_type().is_dir() && EXCLUDED_DIRS.contains(&name.as_ref()) {
        return true;
    }

    false
}

/// Convert a `walkdir::DirEntry` into a [`FileEntry`], if applicable.
fn to_file_entry(entry: &walkdir::DirEntry, root: &Path) -> Option<FileEntry> {
    // Skip the root directory entry itself.
    if entry.path() == root {
        return None;
    }

    let path = entry.path().to_string_lossy().into_owned();
    let raw_name = entry.file_name().to_string_lossy().into_owned();

    let (name, kind) = classify(entry, &raw_name);
    let lowercase_name = name.to_lowercase();

    Some(FileEntry { path, name, kind, lowercase_name })
}

/// Classify the entry kind and compute the display name.
fn classify(entry: &walkdir::DirEntry, raw_name: &str) -> (String, EntryKind) {
    #[cfg(target_os = "macos")]
    if entry.file_type().is_dir()
        && std::path::Path::new(raw_name)
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
    {
        let display = raw_name.strip_suffix(".app").unwrap_or(raw_name);
        return (display.to_owned(), EntryKind::Application);
    }

    if entry.file_type().is_dir() {
        (raw_name.to_owned(), EntryKind::Directory)
    } else {
        (raw_name.to_owned(), EntryKind::File)
    }
}

/// Portable `$HOME` resolution (avoids pulling in the `dirs` crate).
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}
