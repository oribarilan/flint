//! Fuzzy search over the file index using the `nucleo` crate.

use nucleo::pattern::{AtomKind, CaseMatching, Normalization, Pattern};
use nucleo::{Matcher, Utf32Str};
use serde::Serialize;

use crate::indexer::{EntryKind, FileEntry};

/// Maximum number of results returned by a single search.
const MAX_RESULTS: usize = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A single search result sent to the frontend via IPC.
#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    /// Unique identifier (the absolute path).
    pub id: String,
    /// Display name.
    pub name: String,
    /// Absolute path.
    pub path: String,
    /// Entry kind.
    pub kind: EntryKind,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Perform a fuzzy search against `entries`, returning up to `max_results`
/// results sorted by descending match score.
///
/// Returns an empty `Vec` when `query` is empty.
pub fn search(query: &str, entries: &[FileEntry], max_results: usize) -> Vec<SearchResult> {
    if query.is_empty() {
        return Vec::new();
    }

    let limit = max_results.min(MAX_RESULTS);

    let pattern = Pattern::new(query, CaseMatching::Smart, Normalization::Smart, AtomKind::Fuzzy);

    let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
    let mut buf = Vec::new();

    let mut scored: Vec<(u32, &FileEntry)> = entries
        .iter()
        .filter_map(|entry| {
            let haystack = Utf32Str::new(&entry.lowercase_name, &mut buf);
            let score = pattern.score(haystack, &mut matcher)?;
            Some((score, entry))
        })
        .collect();

    // Sort by score descending; ties broken by shorter name first.
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name.len().cmp(&b.1.name.len())));

    scored
        .into_iter()
        .take(limit)
        .map(|(_, entry)| SearchResult {
            id: entry.path.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            kind: entry.kind,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indexer::{EntryKind, FileEntry};

    fn make_entry(name: &str, path: &str, kind: EntryKind) -> FileEntry {
        FileEntry {
            path: path.to_string(),
            name: name.to_string(),
            kind,
            lowercase_name: name.to_lowercase(),
        }
    }

    #[test]
    fn should_return_empty_for_empty_query() {
        let entries = vec![make_entry("Slack", "/app/Slack", EntryKind::Application)];
        let results = search("", &entries, 10);
        assert!(results.is_empty());
    }

    #[test]
    fn should_return_empty_for_no_matches() {
        let entries = vec![make_entry("Slack", "/app/Slack", EntryKind::Application)];
        let results = search("zzzzxxx", &entries, 10);
        assert!(results.is_empty());
    }

    #[test]
    fn should_find_exact_match() {
        let entries = vec![
            make_entry("Slack", "/app/Slack", EntryKind::Application),
            make_entry("Notes", "/app/Notes", EntryKind::Application),
        ];
        let results = search("slack", &entries, 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Slack");
    }

    #[test]
    fn should_find_fuzzy_match() {
        let entries = vec![
            make_entry("Slack", "/app/Slack", EntryKind::Application),
            make_entry("Notes", "/app/Notes", EntryKind::Application),
        ];
        let results = search("slk", &entries, 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Slack");
    }

    #[test]
    fn should_respect_max_results() {
        let entries: Vec<FileEntry> = (0..5)
            .map(|i| make_entry(&format!("file{i}"), &format!("/tmp/file{i}"), EntryKind::File))
            .collect();
        let results = search("file", &entries, 2);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn should_sort_by_score_descending() {
        let entries = vec![
            make_entry("slack_helper", "/app/slack_helper", EntryKind::File),
            make_entry("Slack", "/app/Slack", EntryKind::Application),
            make_entry("my_slack_util", "/app/my_slack_util", EntryKind::File),
        ];
        let results = search("slack", &entries, 10);
        assert!(!results.is_empty());
        // The exact match "Slack" should rank first.
        assert_eq!(results[0].name, "Slack");
    }

    #[test]
    fn should_handle_case_insensitive_query() {
        // Entries with mixed-case names are found via a lowercase query because
        // the search operates on `lowercase_name` with `CaseMatching::Smart`.
        let entries = vec![make_entry("SLaCK", "/app/SLaCK", EntryKind::Application)];
        let results = search("slack", &entries, 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "SLaCK");
    }

    #[test]
    fn should_preserve_entry_metadata() {
        let entries = vec![make_entry("Documents", "/home/user/Documents", EntryKind::Directory)];
        let results = search("documents", &entries, 10);
        assert_eq!(results.len(), 1);
        let r = &results[0];
        assert_eq!(r.id, "/home/user/Documents");
        assert_eq!(r.name, "Documents");
        assert_eq!(r.path, "/home/user/Documents");
        assert_eq!(r.kind, EntryKind::Directory);
    }
}
