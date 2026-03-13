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

/// Build the file index using custom configuration.
///
/// Resolves `~` in directory paths and uses the provided exclude list
/// and depth limit.
pub fn build_index_with_config(
    directories: &[String],
    exclude: &[String],
    max_depth: usize,
) -> Vec<FileEntry> {
    let start = Instant::now();

    let roots = resolve_directories(directories);
    let exclude_refs: Vec<&str> = exclude.iter().map(String::as_str).collect();

    let entries: Vec<FileEntry> = roots
        .par_iter()
        .flat_map(|root| walk_directory_configured(root, &exclude_refs, max_depth))
        .collect();

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
        for path in ["/Applications", "/System/Applications"] {
            let dir = PathBuf::from(path);
            if dir.is_dir() {
                roots.push(dir);
            }
        }
    }
}

/// Expand `~` prefixes and filter to existing directories.
fn resolve_directories(dirs: &[String]) -> Vec<PathBuf> {
    let home = home_dir();
    dirs.iter()
        .filter_map(|d| {
            let path = if let Some(rest) = d.strip_prefix("~/") {
                home.as_ref()?.join(rest)
            } else if d == "~" {
                home.clone()?
            } else {
                PathBuf::from(d)
            };
            path.is_dir().then_some(path)
        })
        .collect()
}

/// Walk a single root directory using the default exclude list and depth.
fn walk_directory(root: &Path) -> Vec<FileEntry> {
    walk_directory_configured(root, EXCLUDED_DIRS, MAX_DEPTH)
}

/// Walk a single root directory with a custom exclude list and depth limit.
///
/// Uses a manual iterator loop so we can call `skip_current_dir()` on
/// package directories (index the package itself but skip its children).
fn walk_directory_configured(root: &Path, exclude: &[&str], max_depth: usize) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let mut it = WalkDir::new(root).max_depth(max_depth).into_iter();

    while let Some(result) = it.next() {
        let Ok(entry) = result else { continue };

        if is_excluded_from(&entry, exclude) {
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

/// Decide whether a `walkdir` entry should be excluded (using default list).
#[cfg(test)]
fn is_excluded(entry: &walkdir::DirEntry) -> bool {
    is_excluded_from(entry, EXCLUDED_DIRS)
}

/// Decide whether a `walkdir` entry should be excluded with a custom list.
fn is_excluded_from(entry: &walkdir::DirEntry, exclude: &[&str]) -> bool {
    let name = entry.file_name().to_string_lossy();

    // Skip hidden directories/files (starting with `.`), except the root itself.
    if entry.depth() > 0 && name.starts_with('.') {
        return true;
    }

    // Skip known noisy directories.
    if entry.file_type().is_dir() && exclude.contains(&name.as_ref()) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;
    use walkdir::WalkDir;

    /// Return the root `DirEntry` for `path` (depth 0).
    fn get_entry(path: &std::path::Path) -> walkdir::DirEntry {
        WalkDir::new(path).into_iter().next().unwrap().unwrap()
    }

    /// Return the `DirEntry` whose file name matches `child_name`.
    fn get_child_entry(parent: &std::path::Path, child_name: &str) -> walkdir::DirEntry {
        WalkDir::new(parent)
            .into_iter()
            .filter_map(Result::ok)
            .find(|e| e.file_name().to_string_lossy() == child_name)
            .unwrap()
    }

    // ----- is_excluded tests -----

    #[test]
    fn should_exclude_hidden_dirs() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join(".hidden")).unwrap();
        let entry = get_child_entry(tmp.path(), ".hidden");
        assert!(is_excluded(&entry));
    }

    #[test]
    fn should_exclude_node_modules() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("node_modules")).unwrap();
        let entry = get_child_entry(tmp.path(), "node_modules");
        assert!(is_excluded(&entry));
    }

    #[test]
    fn should_not_exclude_normal_dir() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("my_project")).unwrap();
        let entry = get_child_entry(tmp.path(), "my_project");
        assert!(!is_excluded(&entry));
    }

    #[test]
    fn should_not_exclude_root_hidden() {
        let tmp = tempdir().unwrap();
        let hidden = tmp.path().join(".dotroot");
        fs::create_dir(&hidden).unwrap();
        // Walking from .dotroot itself makes it depth 0.
        let entry = get_entry(&hidden);
        assert!(!is_excluded(&entry));
    }

    // ----- is_package_dir tests -----

    #[test]
    fn should_detect_app_package_dir() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("Test.app")).unwrap();
        let entry = get_child_entry(tmp.path(), "Test.app");
        if cfg!(target_os = "macos") {
            assert!(is_package_dir(&entry));
        } else {
            assert!(!is_package_dir(&entry));
        }
    }

    #[test]
    fn should_detect_framework_package() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("Test.framework")).unwrap();
        let entry = get_child_entry(tmp.path(), "Test.framework");
        if cfg!(target_os = "macos") {
            assert!(is_package_dir(&entry));
        } else {
            assert!(!is_package_dir(&entry));
        }
    }

    #[test]
    fn should_not_detect_normal_dir_as_package() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("mydir")).unwrap();
        let entry = get_child_entry(tmp.path(), "mydir");
        assert!(!is_package_dir(&entry));
    }

    // ----- classify tests -----

    #[test]
    fn should_classify_app_as_application() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("Cool.app")).unwrap();
        let entry = get_child_entry(tmp.path(), "Cool.app");
        let (name, kind) = classify(&entry, "Cool.app");
        if cfg!(target_os = "macos") {
            assert_eq!(name, "Cool");
            assert_eq!(kind, EntryKind::Application);
        } else {
            assert_eq!(name, "Cool.app");
            assert_eq!(kind, EntryKind::Directory);
        }
    }

    #[test]
    fn should_classify_dir_as_directory() {
        let tmp = tempdir().unwrap();
        fs::create_dir(tmp.path().join("stuff")).unwrap();
        let entry = get_child_entry(tmp.path(), "stuff");
        let (name, kind) = classify(&entry, "stuff");
        assert_eq!(name, "stuff");
        assert_eq!(kind, EntryKind::Directory);
    }

    #[test]
    fn should_classify_file_as_file() {
        let tmp = tempdir().unwrap();
        fs::File::create(tmp.path().join("readme.txt")).unwrap();
        let entry = get_child_entry(tmp.path(), "readme.txt");
        let (name, kind) = classify(&entry, "readme.txt");
        assert_eq!(name, "readme.txt");
        assert_eq!(kind, EntryKind::File);
    }

    // ----- home_dir test -----

    #[test]
    fn should_resolve_home_dir() {
        let home = home_dir();
        assert!(home.is_some(), "$HOME or $USERPROFILE should be set");
    }

    // ----- walk_directory integration tests -----

    #[test]
    fn should_walk_directory_respecting_excludes() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();

        fs::create_dir(root.join("visible")).unwrap();
        fs::File::create(root.join("visible").join("file.txt")).unwrap();
        fs::create_dir(root.join(".hidden")).unwrap();
        fs::File::create(root.join(".hidden").join("secret.txt")).unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::File::create(root.join("node_modules").join("pkg.js")).unwrap();
        fs::File::create(root.join("top.txt")).unwrap();

        let entries = walk_directory(root);
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        assert!(names.contains(&"visible"), "should include visible dir");
        assert!(names.contains(&"file.txt"), "should include nested file");
        assert!(names.contains(&"top.txt"), "should include top-level file");
        assert!(!names.contains(&".hidden"), "should exclude hidden dir");
        assert!(!names.contains(&"secret.txt"), "should exclude hidden child");
        assert!(!names.contains(&"node_modules"), "should exclude node_modules");
        assert!(!names.contains(&"pkg.js"), "should exclude node_modules child");
    }

    #[test]
    fn should_not_recurse_into_package_dirs() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();

        let app_dir = root.join("Test.app");
        let contents_dir = app_dir.join("Contents");
        fs::create_dir_all(&contents_dir).unwrap();
        fs::File::create(contents_dir.join("Info.plist")).unwrap();

        let entries = walk_directory(root);
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        if cfg!(target_os = "macos") {
            // On macOS, Test.app is classified as Application — display name strips ".app".
            assert!(names.contains(&"Test"), "should include Test.app as 'Test'");
            assert!(!names.contains(&"Contents"), "should not recurse into .app");
            assert!(!names.contains(&"Info.plist"), "should not recurse into .app");
        } else {
            // On other platforms it's just a normal directory.
            assert!(names.contains(&"Test.app"), "should include Test.app dir");
        }
    }

    // ----- resolve_directories tests -----

    #[test]
    fn should_resolve_absolute_directories() {
        let tmp = tempdir().unwrap();
        let sub = tmp.path().join("subdir");
        fs::create_dir(&sub).unwrap();

        let dirs = vec![sub.to_string_lossy().into_owned()];
        let resolved = resolve_directories(&dirs);
        assert_eq!(resolved, vec![sub]);
    }

    #[test]
    fn should_skip_nonexistent_directories() {
        let dirs = vec!["/nonexistent/path/abc123".to_owned()];
        let resolved = resolve_directories(&dirs);
        assert!(resolved.is_empty());
    }

    // ----- build_index_with_config tests -----

    #[test]
    fn should_build_index_with_custom_config() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();

        fs::create_dir(root.join("mydir")).unwrap();
        fs::File::create(root.join("mydir").join("file.txt")).unwrap();
        fs::create_dir(root.join("excluded_dir")).unwrap();
        fs::File::create(root.join("excluded_dir").join("hidden.txt")).unwrap();

        let dirs = vec![root.to_string_lossy().into_owned()];
        let exclude = vec!["excluded_dir".to_owned()];

        let entries = build_index_with_config(&dirs, &exclude, 3);
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        assert!(names.contains(&"mydir"));
        assert!(names.contains(&"file.txt"));
        assert!(!names.contains(&"excluded_dir"));
        assert!(!names.contains(&"hidden.txt"));
    }

    #[test]
    fn should_respect_max_depth_in_config() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();

        // Create nested dirs: root/a/b/c/deep.txt
        let deep = root.join("a").join("b").join("c");
        fs::create_dir_all(&deep).unwrap();
        fs::File::create(deep.join("deep.txt")).unwrap();
        fs::File::create(root.join("top.txt")).unwrap();

        let dirs = vec![root.to_string_lossy().into_owned()];
        let exclude: Vec<String> = Vec::new();

        // max_depth 1 should only see immediate children
        let entries = build_index_with_config(&dirs, &exclude, 1);
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

        assert!(names.contains(&"top.txt"));
        assert!(names.contains(&"a"));
        assert!(!names.contains(&"b"), "depth 1 should not reach b");
    }
}
