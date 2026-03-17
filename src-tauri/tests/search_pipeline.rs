use std::fs;

use flint_lib::indexer::{EntryKind, FileEntry};
use flint_lib::search;
use tempfile::tempdir;

/// Build a Vec of FileEntry from files in a temp directory (for testing
/// the search module without Spotlight).
fn entries_from_temp_dir(root: &std::path::Path) -> Vec<FileEntry> {
    let mut entries = Vec::new();

    for result in walkdir_lite(root) {
        let (path, name, is_dir) = result;
        let kind = if is_dir { EntryKind::Directory } else { EntryKind::File };
        entries.push(FileEntry {
            path,
            name: name.clone(),
            kind,
            lowercase_name: name.to_lowercase(),
        });
    }

    entries
}

/// Minimal directory walker for test fixtures (no dependencies on the
/// indexer's walker module which has been removed).
fn walkdir_lite(root: &std::path::Path) -> Vec<(String, String, bool)> {
    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path().to_string_lossy().to_string();
            let is_dir = entry.file_type().map_or(false, |ft| ft.is_dir());
            results.push((path, name, is_dir));
        }
    }
    results
}

#[test]
fn should_find_files_by_name() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("report.pdf"), "").unwrap();
    fs::write(dir.path().join("notes.txt"), "").unwrap();
    fs::create_dir(dir.path().join("projects")).unwrap();

    let entries = entries_from_temp_dir(dir.path());
    let results = search::search("report", &entries, 20);

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name, "report.pdf");
}

#[test]
fn should_rank_exact_match_higher() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("Slack.app"), "").unwrap();
    fs::write(dir.path().join("SlackHelper.txt"), "").unwrap();

    let entries = entries_from_temp_dir(dir.path());
    let results = search::search("slack", &entries, 20);

    assert!(results.len() >= 2);
    // Shorter name (better match) should rank first.
    assert_eq!(results[0].name, "Slack.app");
}

#[test]
fn should_exclude_hidden_files_from_walker() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("visible.txt"), "").unwrap();
    fs::create_dir(dir.path().join(".hidden")).unwrap();
    fs::write(dir.path().join(".hidden").join("secret.txt"), "").unwrap();

    let entries = entries_from_temp_dir(dir.path());
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

    assert!(names.contains(&"visible.txt"));
    assert!(!names.contains(&"secret.txt"));
    assert!(!names.contains(&".hidden"));
}

#[test]
fn scored_search_returns_scores_with_results() {
    let entries = vec![
        FileEntry {
            path: "/app/Slack".to_string(),
            name: "Slack".to_string(),
            kind: EntryKind::Application,
            lowercase_name: "slack".to_string(),
        },
        FileEntry {
            path: "/home/readme.txt".to_string(),
            name: "readme.txt".to_string(),
            kind: EntryKind::File,
            lowercase_name: "readme.txt".to_string(),
        },
    ];

    let scored = search::scored_search("slack", &entries, 20);
    assert_eq!(scored.len(), 1);
    assert!(scored[0].0 > 0, "score should be positive");
    assert_eq!(scored[0].1.name, "Slack");
}

#[cfg(target_os = "macos")]
mod spotlight_tests {
    use flint_lib::indexer::spotlight;
    use flint_lib::indexer::EntryKind;

    #[test]
    fn discover_apps_finds_system_apps() {
        let apps = spotlight::discover_apps().expect("mdfind should work on macOS");
        assert!(!apps.is_empty());
        assert!(
            apps.iter().any(|e| e.kind == EntryKind::Application),
            "should find at least one application"
        );
    }

    #[tokio::test]
    async fn search_files_does_not_error_for_valid_query() {
        let result = spotlight::search_files("test", &["~".to_owned()]).await;
        assert!(result.is_ok(), "Spotlight file search should not error");
    }

    #[tokio::test]
    async fn search_files_empty_query_returns_empty() {
        let results = spotlight::search_files("", &["~".to_owned()]).await.unwrap();
        assert!(results.is_empty());
    }
}
