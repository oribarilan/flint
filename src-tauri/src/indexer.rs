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

/// Directory names to skip entirely (all platforms).
const EXCLUDED_DIRS: &[&str] =
    &["node_modules", ".git", "target", "__pycache__", ".Trash", "venv", "env", "bower_components"];

/// macOS bundle extensions — index the package as a leaf but never recurse in.
#[cfg(target_os = "macos")]
const MACOS_PACKAGE_EXTENSIONS: &[&str] = &[
    "app",
    "framework",
    "bundle",
    "plugin",
    "prefpane",
    "kext",
    "photoslibrary",
    "musiclibrary",
    "xcodeproj",
    "xcworkspace",
    "playground",
];

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
///
/// Uses a manual iterator loop so we can call `skip_current_dir()` on
/// package directories (index the package itself but skip its children).
fn walk_directory(root: &Path) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let mut it = WalkDir::new(root).max_depth(MAX_DEPTH).into_iter();

    while let Some(result) = it.next() {
        let Ok(entry) = result else { continue };

        if is_excluded(&entry) {
            if entry.file_type().is_dir() {
                it.skip_current_dir();
            }
            continue;
        }

        let is_package = is_package_dir(&entry);

        if let Some(fe) = to_file_entry(&entry, root) {
            entries.push(fe);
        }

        // Index the package entry but do not walk into it.
        if is_package {
            it.skip_current_dir();
        }
    }

    entries
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

/// Check whether a directory is a macOS package bundle that should be indexed
/// as a leaf node (no recursion into its contents).
fn is_package_dir(entry: &walkdir::DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(ext) = std::path::Path::new(&*entry.file_name().to_string_lossy()).extension() {
            return MACOS_PACKAGE_EXTENSIONS
                .iter()
                .any(|pkg_ext| ext.eq_ignore_ascii_case(pkg_ext));
        }
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
    if entry.file_type().is_dir() {
        if let Some(ext) = std::path::Path::new(raw_name).extension() {
            if ext.eq_ignore_ascii_case("app") {
                let display = raw_name.strip_suffix(".app").unwrap_or(raw_name);
                return (display.to_owned(), EntryKind::Application);
            }
        }
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
