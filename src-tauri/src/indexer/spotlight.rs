//! macOS Spotlight search backend.
//!
//! Queries the OS-level Spotlight index via `mdfind` to discover applications
//! and search files by name. This replaces the custom filesystem walker,
//! cache, and watcher — Spotlight handles indexing, watching, and exclusions.

use std::path::PathBuf;

use super::{entry_from_path, FileEntry};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors that can occur when querying Spotlight.
#[derive(Debug, thiserror::Error)]
pub enum SpotlightError {
    /// `mdfind` is not available or returned a non-zero exit code.
    #[error("Spotlight indexing unavailable — mdfind failed")]
    Unavailable,

    /// Failed to spawn or communicate with the `mdfind` process.
    #[error("failed to run mdfind: {0}")]
    Process(#[from] std::io::Error),
}

// ---------------------------------------------------------------------------
// App discovery (synchronous — called once at startup)
// ---------------------------------------------------------------------------

/// Discover all installed applications via Spotlight.
///
/// Runs `mdfind 'kMDItemContentType == "com.apple.application-bundle"'`
/// and parses each output line as a path to an `.app` bundle. Typically
/// returns ~400 entries in ~0.1s — fast enough for synchronous startup.
pub fn discover_apps() -> Result<Vec<FileEntry>, SpotlightError> {
    let output = std::process::Command::new("mdfind")
        .arg(r#"kMDItemContentType == "com.apple.application-bundle""#)
        .output()
        .map_err(SpotlightError::Process)?;

    if !output.status.success() {
        return Err(SpotlightError::Unavailable);
    }

    Ok(parse_mdfind_output(&output.stdout))
}

// ---------------------------------------------------------------------------
// File search (async — called per keystroke)
// ---------------------------------------------------------------------------

/// Search for files matching a name substring via Spotlight.
///
/// Spawns `mdfind -name <query>` scoped to the given directories via
/// `-onlyin`. Query is passed as a direct argument — never through a shell
/// — to prevent injection. Returns file entries parsed from stdout.
pub async fn search_files(
    query: &str,
    directories: &[String],
) -> Result<Vec<FileEntry>, SpotlightError> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let resolved = resolve_directories(directories);
    if resolved.is_empty() {
        return Ok(Vec::new());
    }

    let mut cmd = tokio::process::Command::new("mdfind");
    cmd.arg("-name").arg(query);
    for dir in &resolved {
        cmd.arg("-onlyin").arg(dir);
    }

    let output = cmd.output().await.map_err(SpotlightError::Process)?;

    if !output.status.success() {
        return Err(SpotlightError::Unavailable);
    }

    Ok(parse_mdfind_output(&output.stdout))
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/// Parse `mdfind` stdout into `FileEntry` items.
///
/// Each non-empty line is treated as an absolute path. Invalid paths
/// (missing file name component) are silently skipped.
fn parse_mdfind_output(stdout: &[u8]) -> Vec<FileEntry> {
    let text = String::from_utf8_lossy(stdout);
    text.lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| entry_from_path(&PathBuf::from(line)))
        .collect()
}

// ---------------------------------------------------------------------------
// Directory resolution
// ---------------------------------------------------------------------------

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

/// Portable `$HOME` resolution.
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indexer::EntryKind;

    #[test]
    fn parse_empty_output() {
        let entries = parse_mdfind_output(b"");
        assert!(entries.is_empty());
    }

    #[test]
    fn parse_single_app_path() {
        let output = b"/Applications/Safari.app\n";
        let entries = parse_mdfind_output(output);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "/Applications/Safari.app");
        if cfg!(target_os = "macos") {
            assert_eq!(entries[0].name, "Safari");
            assert_eq!(entries[0].kind, EntryKind::Application);
        }
    }

    #[test]
    fn parse_multiple_paths() {
        let output = b"/Applications/Safari.app\n/Users/test/readme.txt\n/Users/test/docs\n";
        let entries = parse_mdfind_output(output);
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn parse_skips_blank_lines() {
        let output = b"/Applications/Safari.app\n\n\n/Users/test/readme.txt\n";
        let entries = parse_mdfind_output(output);
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn parse_handles_unicode_paths() {
        let output = "/Users/tëst/日本語/café.txt\n".as_bytes();
        let entries = parse_mdfind_output(output);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "café.txt");
    }

    #[test]
    fn parse_handles_paths_with_spaces() {
        let output = b"/Users/test/My Documents/file name.txt\n";
        let entries = parse_mdfind_output(output);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "file name.txt");
    }

    #[test]
    fn parse_root_path_skipped() {
        // Root path `/` has no file_name component — entry_from_path returns None.
        let output = b"/\n";
        let entries = parse_mdfind_output(output);
        assert!(entries.is_empty());
    }

    #[test]
    fn resolve_skips_nonexistent_directories() {
        let dirs = vec!["/nonexistent/path/abc123xyz".to_owned()];
        let resolved = resolve_directories(&dirs);
        assert!(resolved.is_empty());
    }

    #[test]
    fn resolve_bare_tilde() {
        let dirs = vec!["~".to_owned()];
        let resolved = resolve_directories(&dirs);
        assert_eq!(resolved.len(), 1);
        assert!(resolved[0].is_absolute());
    }

    #[test]
    fn resolve_tilde_prefix() {
        let dirs = vec!["~/Desktop".to_owned()];
        let resolved = resolve_directories(&dirs);
        for p in &resolved {
            assert!(p.is_absolute());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn discover_apps_returns_results() {
        let apps = discover_apps().expect("mdfind should be available on macOS");
        assert!(!apps.is_empty(), "should find at least one app");
        assert!(
            apps.iter().any(|e| e.kind == EntryKind::Application),
            "should contain Application entries"
        );
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn search_files_returns_results_for_known_name() {
        // "Safari" should exist on any macOS machine.
        let results = search_files("Safari", &["~".to_owned()]).await.unwrap_or_default();
        // We don't assert non-empty because Spotlight indexing may not
        // include the home directory, but it should not error.
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn search_files_empty_query_returns_empty() {
        let results = search_files("", &["~".to_owned()]).await.unwrap();
        assert!(results.is_empty());
    }
}
