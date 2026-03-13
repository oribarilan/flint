use std::fs;
use std::path::Path;

use flint_lib::indexer::{EntryKind, FileEntry};
use flint_lib::search;
use tempfile::tempdir;
use walkdir::WalkDir;

/// Walk a temporary directory using the same filtering logic as the indexer:
/// skip hidden entries (depth > 0 and name starts with `.`) and do not
/// recurse into hidden directories.
fn walk_temp_dir(root: &Path) -> Vec<FileEntry> {
    let mut entries = Vec::new();
    let mut it = WalkDir::new(root).max_depth(6).into_iter();

    while let Some(Ok(e)) = it.next() {
        if e.path() == root {
            continue;
        }

        let name = e.file_name().to_string_lossy();
        if e.depth() > 0 && name.starts_with('.') {
            if e.file_type().is_dir() {
                it.skip_current_dir();
            }
            continue;
        }

        let name = name.to_string();
        let kind = if e.file_type().is_dir() { EntryKind::Directory } else { EntryKind::File };

        entries.push(FileEntry {
            path: e.path().to_string_lossy().to_string(),
            name: name.clone(),
            kind,
            lowercase_name: name.to_lowercase(),
        });
    }

    entries
}

#[test]
fn should_find_files_in_indexed_directory() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("report.pdf"), "").unwrap();
    fs::write(dir.path().join("notes.txt"), "").unwrap();
    fs::create_dir(dir.path().join("projects")).unwrap();

    let entries = walk_temp_dir(dir.path());
    let results = search::search("report", &entries, 20);

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].name, "report.pdf");
}

#[test]
fn should_rank_exact_match_higher() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("Slack.app"), "").unwrap();
    fs::write(dir.path().join("SlackHelper.txt"), "").unwrap();

    let entries = walk_temp_dir(dir.path());
    let results = search::search("slack", &entries, 20);

    assert!(results.len() >= 2);
    // Shorter name (better match) should rank first.
    assert_eq!(results[0].name, "Slack.app");
}

#[test]
fn should_exclude_hidden_files_from_index() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("visible.txt"), "").unwrap();
    fs::create_dir(dir.path().join(".hidden")).unwrap();
    fs::write(dir.path().join(".hidden").join("secret.txt"), "").unwrap();

    let entries = walk_temp_dir(dir.path());
    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();

    assert!(names.contains(&"visible.txt"));
    assert!(!names.contains(&"secret.txt"));
    assert!(!names.contains(&".hidden"));
}
