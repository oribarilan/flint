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
