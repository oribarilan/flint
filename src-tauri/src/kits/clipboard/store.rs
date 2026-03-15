//! Clipboard entry storage — in-memory store backed by a JSON file.
//!
//! All entries live in a `Vec<ClipboardEntry>` in memory. Mutations are
//! persisted to `clipboard.json` in the kit's data directory. With ≤200
//! entries this is trivially fast.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Maximum characters of the first line used as preview text.
const MAX_PREVIEW_CHARS: usize = 200;

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

/// A single clipboard history entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardEntry {
    /// Auto-incrementing identifier.
    pub id: u64,
    /// Hash of the full content, used for dedup.
    pub content_hash: u64,
    /// First line of the content, truncated for display.
    pub preview: String,
    /// Complete text (up to 100 KB). Empty for redacted entries.
    pub full_content: String,
    /// App that wrote to the clipboard (best-effort).
    pub source_app: Option<String>,
    /// When the entry was last copied.
    pub timestamp: DateTime<Utc>,
    /// Whether the user has pinned this entry.
    pub pinned: bool,
    /// Sensitive-filtered entry — content not stored.
    pub redacted: bool,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/// In-memory clipboard history with file-backed persistence.
pub struct ClipboardStore {
    entries: Vec<ClipboardEntry>,
    next_id: u64,
    file_path: PathBuf,
    max_history: usize,
    retention_days: u32,
}

/// Persisted format — just the entries list.
#[derive(Serialize, Deserialize)]
struct StoreFile {
    entries: Vec<ClipboardEntry>,
    next_id: u64,
}

impl ClipboardStore {
    /// Create a new store, loading existing entries from disk if available.
    pub fn load(data_dir: &Path, max_history: usize, retention_days: u32) -> Self {
        let file_path = data_dir.join("clipboard.json");

        let (entries, next_id) = if file_path.exists() {
            match std::fs::read_to_string(&file_path) {
                Ok(contents) => match serde_json::from_str::<StoreFile>(&contents) {
                    Ok(store_file) => (store_file.entries, store_file.next_id),
                    Err(e) => {
                        tracing::warn!(error = %e, "failed to parse clipboard store, starting fresh");
                        (Vec::new(), 1)
                    }
                },
                Err(e) => {
                    tracing::warn!(error = %e, "failed to read clipboard store, starting fresh");
                    (Vec::new(), 1)
                }
            }
        } else {
            (Vec::new(), 1)
        };

        let mut store = Self { entries, next_id, file_path, max_history, retention_days };
        store.cleanup_expired();
        store
    }

    /// Create an empty store with no file backing.
    ///
    /// Used as the initial state before `init()` loads from disk.
    pub const fn empty() -> Self {
        Self {
            entries: Vec::new(),
            next_id: 1,
            file_path: PathBuf::new(),
            max_history: 200,
            retention_days: 7,
        }
    }

    /// Create a store with no file backing (for tests).
    #[cfg(test)]
    pub fn in_memory(max_history: usize, retention_days: u32) -> Self {
        Self {
            entries: Vec::new(),
            next_id: 1,
            file_path: PathBuf::from("/dev/null"),
            max_history,
            retention_days,
        }
    }

    // ── Queries ─────────────────────────────────────────────────

    /// All entries, pinned first then by timestamp descending.
    pub fn all_sorted(&self) -> Vec<&ClipboardEntry> {
        let mut sorted: Vec<&ClipboardEntry> = self.entries.iter().collect();
        sorted.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.timestamp.cmp(&a.timestamp)));
        sorted
    }

    /// Find an entry by content hash.
    #[cfg(test)]
    pub fn find_by_hash(&self, hash: u64) -> Option<&ClipboardEntry> {
        self.entries.iter().find(|e| e.content_hash == hash)
    }

    /// Find an entry by ID.
    #[cfg(test)]
    pub fn find_by_id(&self, id: u64) -> Option<&ClipboardEntry> {
        self.entries.iter().find(|e| e.id == id)
    }

    /// Number of non-pinned, non-redacted entries.
    pub fn regular_count(&self) -> usize {
        self.entries.iter().filter(|e| !e.pinned && !e.redacted).count()
    }

    /// Total entry count (including pinned and redacted).
    #[cfg(test)]
    pub const fn len(&self) -> usize {
        self.entries.len()
    }

    // ── Mutations ───────────────────────────────────────────────

    /// Insert a new entry or update an existing duplicate.
    ///
    /// If content with the same hash exists, updates its timestamp and moves
    /// it to the front. Otherwise inserts a new entry and enforces the
    /// `max_history` cap by removing the oldest non-pinned entry.
    ///
    /// Returns the entry ID.
    pub fn insert(&mut self, content: &str, source_app: Option<String>) -> u64 {
        let hash = compute_hash(content);
        let now = Utc::now();

        // Dedup: if same content exists, update timestamp.
        if let Some(existing) = self.entries.iter_mut().find(|e| e.content_hash == hash) {
            existing.timestamp = now;
            existing.source_app = source_app;
            let id = existing.id;
            self.persist();
            return id;
        }

        let preview = extract_preview(content);
        let entry = ClipboardEntry {
            id: self.next_id,
            content_hash: hash,
            preview,
            full_content: content.to_string(),
            source_app,
            timestamp: now,
            pinned: false,
            redacted: false,
        };

        let id = entry.id;
        self.next_id += 1;
        self.entries.push(entry);
        self.enforce_max_history();
        self.persist();
        id
    }

    /// Insert a redacted placeholder (sensitive content filtered).
    ///
    /// No content is stored. Redacted entries do not count toward `max_history`.
    pub fn insert_redacted(&mut self, source_app: Option<String>) -> u64 {
        let entry = ClipboardEntry {
            id: self.next_id,
            content_hash: 0,
            preview: "🔒 Sensitive content filtered".to_string(),
            full_content: String::new(),
            source_app,
            timestamp: Utc::now(),
            pinned: false,
            redacted: true,
        };

        let id = entry.id;
        self.next_id += 1;
        self.entries.push(entry);
        self.persist();
        id
    }

    /// Toggle the pinned state of an entry. Returns the new pinned state.
    pub fn toggle_pin(&mut self, id: u64) -> Option<bool> {
        let entry = self.entries.iter_mut().find(|e| e.id == id)?;
        entry.pinned = !entry.pinned;
        let pinned = entry.pinned;
        self.persist();
        Some(pinned)
    }

    /// Delete a single entry by ID.
    pub fn delete(&mut self, id: u64) -> bool {
        let before = self.entries.len();
        self.entries.retain(|e| e.id != id);
        let removed = self.entries.len() < before;
        if removed {
            self.persist();
        }
        removed
    }

    /// Delete all non-pinned entries.
    pub fn clear_non_pinned(&mut self) -> usize {
        let before = self.entries.len();
        self.entries.retain(|e| e.pinned);
        let removed = before - self.entries.len();
        if removed > 0 {
            self.persist();
        }
        removed
    }

    // ── Internal ────────────────────────────────────────────────

    /// Remove entries older than `retention_days`. Pinned entries are exempt.
    fn cleanup_expired(&mut self) {
        if self.retention_days == 0 {
            return;
        }
        let cutoff = Utc::now() - chrono::Duration::days(i64::from(self.retention_days));
        let before = self.entries.len();
        self.entries.retain(|e| e.pinned || e.timestamp > cutoff);
        if self.entries.len() < before {
            self.persist();
        }
    }

    /// Enforce the max history cap by removing the oldest non-pinned entries.
    fn enforce_max_history(&mut self) {
        while self.regular_count() > self.max_history {
            // Find the oldest non-pinned, non-redacted entry.
            let oldest_idx = self
                .entries
                .iter()
                .enumerate()
                .filter(|(_, e)| !e.pinned && !e.redacted)
                .min_by_key(|(_, e)| e.timestamp)
                .map(|(i, _)| i);

            if let Some(idx) = oldest_idx {
                self.entries.remove(idx);
            } else {
                break;
            }
        }
    }

    /// Write the current state to disk.
    fn persist(&self) {
        let store_file = StoreFile { entries: self.entries.clone(), next_id: self.next_id };
        match serde_json::to_string_pretty(&store_file) {
            Ok(json) => {
                if let Some(parent) = self.file_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                if let Err(e) = std::fs::write(&self.file_path, json) {
                    tracing::error!(error = %e, "failed to persist clipboard store");
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "failed to serialize clipboard store");
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Compute a hash of the content using Rust's `DefaultHasher`.
pub fn compute_hash(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}

/// Extract the first line as a preview, truncated with `…` if needed.
pub fn extract_preview(content: &str) -> String {
    let first_line = content.lines().next().unwrap_or("");
    if first_line.chars().count() <= MAX_PREVIEW_CHARS {
        first_line.to_string()
    } else {
        let truncated: String = first_line.chars().take(MAX_PREVIEW_CHARS).collect();
        format!("{truncated}…")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    // ── compute_hash ────────────────────────────────────────────

    #[test]
    fn should_produce_same_hash_for_same_content() {
        assert_eq!(compute_hash("hello"), compute_hash("hello"));
    }

    #[test]
    fn should_produce_different_hash_for_different_content() {
        assert_ne!(compute_hash("hello"), compute_hash("world"));
    }

    // ── extract_preview ─────────────────────────────────────────

    #[test]
    fn should_extract_first_line() {
        assert_eq!(extract_preview("first line\nsecond line"), "first line");
    }

    #[test]
    fn should_handle_single_line() {
        assert_eq!(extract_preview("just one line"), "just one line");
    }

    #[test]
    fn should_truncate_long_first_line() {
        let long = "a".repeat(300);
        let preview = extract_preview(&long);
        assert!(preview.ends_with('…'));
        assert!(preview.chars().count() <= MAX_PREVIEW_CHARS + 1);
    }

    #[test]
    fn should_handle_empty_content() {
        assert_eq!(extract_preview(""), "");
    }

    // ── ClipboardStore: insert & dedup ──────────────────────────

    #[test]
    fn should_insert_entry() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("hello world", None);
        assert_eq!(id, 1);
        assert_eq!(store.len(), 1);

        let entry = store.find_by_id(id).unwrap();
        assert_eq!(entry.full_content, "hello world");
        assert_eq!(entry.preview, "hello world");
        assert!(!entry.pinned);
        assert!(!entry.redacted);
    }

    #[test]
    fn should_dedup_same_content() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id1 = store.insert("hello", None);
        let id2 = store.insert("hello", None);
        assert_eq!(id1, id2);
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn should_update_timestamp_on_dedup() {
        let mut store = ClipboardStore::in_memory(200, 7);
        store.insert("hello", None);
        let ts1 = store.find_by_id(1).unwrap().timestamp;

        std::thread::sleep(std::time::Duration::from_millis(10));
        store.insert("hello", None);
        let ts2 = store.find_by_id(1).unwrap().timestamp;

        assert!(ts2 > ts1);
    }

    #[test]
    fn should_insert_different_content_separately() {
        let mut store = ClipboardStore::in_memory(200, 7);
        store.insert("hello", None);
        store.insert("world", None);
        assert_eq!(store.len(), 2);
    }

    // ── ClipboardStore: max_history ─────────────────────────────

    #[test]
    fn should_enforce_max_history_on_insert() {
        let mut store = ClipboardStore::in_memory(3, 7);
        for i in 0..5 {
            store.insert(&format!("entry {i}"), None);
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        assert_eq!(store.regular_count(), 3);
        // Most recent entries should survive.
        assert!(store.find_by_hash(compute_hash("entry 4")).is_some());
        assert!(store.find_by_hash(compute_hash("entry 3")).is_some());
        assert!(store.find_by_hash(compute_hash("entry 2")).is_some());
    }

    #[test]
    fn should_not_evict_pinned_entries_for_max_history() {
        let mut store = ClipboardStore::in_memory(2, 7);
        let id = store.insert("pinned entry", None);
        store.toggle_pin(id);

        store.insert("entry 1", None);
        store.insert("entry 2", None);
        store.insert("entry 3", None);

        // Pinned entry + 2 regular = 3 total, but regular count is capped at 2.
        assert_eq!(store.regular_count(), 2);
        assert!(store.find_by_id(id).is_some());
        assert!(store.find_by_id(id).unwrap().pinned);
    }

    // ── ClipboardStore: pin ─────────────────────────────────────

    #[test]
    fn should_toggle_pin() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("test", None);

        assert_eq!(store.toggle_pin(id), Some(true));
        assert!(store.find_by_id(id).unwrap().pinned);

        assert_eq!(store.toggle_pin(id), Some(false));
        assert!(!store.find_by_id(id).unwrap().pinned);
    }

    #[test]
    fn should_return_none_for_invalid_pin_id() {
        let mut store = ClipboardStore::in_memory(200, 7);
        assert_eq!(store.toggle_pin(999), None);
    }

    // ── ClipboardStore: delete ──────────────────────────────────

    #[test]
    fn should_delete_entry() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("test", None);
        assert!(store.delete(id));
        assert_eq!(store.len(), 0);
    }

    #[test]
    fn should_return_false_for_nonexistent_delete() {
        let mut store = ClipboardStore::in_memory(200, 7);
        assert!(!store.delete(999));
    }

    // ── ClipboardStore: clear ───────────────────────────────────

    #[test]
    fn should_clear_non_pinned_entries() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id1 = store.insert("pinned", None);
        store.toggle_pin(id1);
        store.insert("regular 1", None);
        store.insert("regular 2", None);

        let removed = store.clear_non_pinned();
        assert_eq!(removed, 2);
        assert_eq!(store.len(), 1);
        assert!(store.find_by_id(id1).is_some());
    }

    // ── ClipboardStore: retention ───────────────────────────────

    #[test]
    fn should_cleanup_expired_entries() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("old entry", None);

        // Manually backdate the entry.
        let entry = store.entries.iter_mut().find(|e| e.id == id).unwrap();
        entry.timestamp = Utc::now() - Duration::days(10);

        store.cleanup_expired();
        assert_eq!(store.len(), 0);
    }

    #[test]
    fn should_not_cleanup_pinned_expired_entries() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("old pinned", None);
        store.toggle_pin(id);

        let entry = store.entries.iter_mut().find(|e| e.id == id).unwrap();
        entry.timestamp = Utc::now() - Duration::days(10);

        store.cleanup_expired();
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn should_not_cleanup_recent_entries() {
        let mut store = ClipboardStore::in_memory(200, 7);
        store.insert("recent entry", None);

        store.cleanup_expired();
        assert_eq!(store.len(), 1);
    }

    // ── ClipboardStore: sorting ─────────────────────────────────

    #[test]
    fn should_sort_pinned_first_then_by_timestamp() {
        let mut store = ClipboardStore::in_memory(200, 7);
        store.insert("entry 1", None);
        std::thread::sleep(std::time::Duration::from_millis(5));
        let id2 = store.insert("entry 2", None);
        std::thread::sleep(std::time::Duration::from_millis(5));
        store.insert("entry 3", None);

        store.toggle_pin(id2);

        let sorted = store.all_sorted();
        assert_eq!(sorted[0].full_content, "entry 2"); // pinned
        assert_eq!(sorted[1].full_content, "entry 3"); // most recent
        assert_eq!(sorted[2].full_content, "entry 1"); // oldest
    }

    // ── ClipboardStore: redacted entries ─────────────────────────

    #[test]
    fn should_insert_redacted_entry() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert_redacted(Some("1Password".to_string()));

        let entry = store.find_by_id(id).unwrap();
        assert!(entry.redacted);
        assert!(entry.full_content.is_empty());
        assert!(entry.preview.contains("Sensitive"));
    }

    #[test]
    fn should_not_count_redacted_toward_max_history() {
        let mut store = ClipboardStore::in_memory(2, 7);
        store.insert_redacted(None);
        store.insert_redacted(None);
        store.insert("regular 1", None);
        store.insert("regular 2", None);
        store.insert("regular 3", None);

        // 2 regular (capped) + 2 redacted = 4 total
        assert_eq!(store.regular_count(), 2);
        assert!(store.len() >= 4);
    }

    // ── ClipboardStore: source_app ──────────────────────────────

    #[test]
    fn should_store_source_app() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("test", Some("VS Code".to_string()));
        let entry = store.find_by_id(id).unwrap();
        assert_eq!(entry.source_app.as_deref(), Some("VS Code"));
    }

    // ── extract_preview: unicode ────────────────────────────────

    #[test]
    fn should_not_truncate_short_unicode_content() {
        let emoji = "🔥".repeat(60); // 60 chars, 240 bytes
        let preview = extract_preview(&emoji);
        assert!(!preview.ends_with('…'));
        assert_eq!(preview.chars().count(), 60);
    }

    #[test]
    fn should_truncate_long_unicode_content() {
        let emoji = "🔥".repeat(250); // 250 chars > MAX_PREVIEW_CHARS
        let preview = extract_preview(&emoji);
        assert!(preview.ends_with('…'));
        assert_eq!(preview.chars().count(), MAX_PREVIEW_CHARS + 1);
    }

    // ── ClipboardStore: dedup source_app update ─────────────────

    #[test]
    fn should_update_source_app_on_dedup() {
        let mut store = ClipboardStore::in_memory(200, 7);
        let id = store.insert("hello", Some("VS Code".to_string()));

        store.insert("hello", Some("Chrome".to_string()));

        let entry = store.find_by_id(id).unwrap();
        assert_eq!(entry.source_app.as_deref(), Some("Chrome"));
    }

    // ── ClipboardStore: file persistence round-trip ─────────────

    #[test]
    fn should_persist_and_reload_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path();

        // Create store, insert some entries.
        {
            let mut store = ClipboardStore::load(path, 200, 7);
            store.insert("entry one", None);
            store.insert("entry two", Some("App".to_string()));
            let id = store.insert("pinned", None);
            store.toggle_pin(id);
            store.insert_redacted(Some("1Password".to_string()));
        }

        // Reload from disk.
        let store = ClipboardStore::load(path, 200, 7);
        assert_eq!(store.len(), 4);

        // Verify content survived.
        let sorted = store.all_sorted();
        assert!(sorted.iter().any(|e| e.full_content == "entry one"));
        assert!(sorted.iter().any(|e| e.pinned && e.full_content == "pinned"));
        assert!(sorted.iter().any(|e| e.redacted));
    }

    #[test]
    fn should_preserve_next_id_across_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path();

        let id1 = {
            let mut store = ClipboardStore::load(path, 200, 7);
            store.insert("first", None);
            store.insert("second", None)
        };

        let mut store = ClipboardStore::load(path, 200, 7);
        let id2 = store.insert("third", None);
        assert!(id2 > id1, "next_id should increment across reloads");
    }

    #[test]
    fn should_handle_corrupted_store_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("clipboard.json");
        std::fs::write(&file_path, "not valid json{{{").unwrap();

        let store = ClipboardStore::load(dir.path(), 200, 7);
        assert_eq!(store.len(), 0); // starts fresh
    }

    // ── ClipboardStore: edge cases ──────────────────────────────

    #[test]
    fn should_clear_non_pinned_on_empty_store() {
        let mut store = ClipboardStore::in_memory(200, 7);
        assert_eq!(store.clear_non_pinned(), 0);
    }

    #[test]
    fn should_handle_all_pinned_under_max_history() {
        let mut store = ClipboardStore::in_memory(2, 7);
        // Pin each entry immediately to prevent eviction.
        let id1 = store.insert("a", None);
        store.toggle_pin(id1);
        let id2 = store.insert("b", None);
        store.toggle_pin(id2);
        let id3 = store.insert("c", None);
        store.toggle_pin(id3);

        // All are pinned — regular_count is 0, nothing should be evicted.
        store.insert("d", None);
        assert!(store.len() >= 4);
    }

    #[test]
    fn should_handle_zero_retention_days() {
        let mut store = ClipboardStore::in_memory(200, 0);
        store.insert("test", None);
        // retention_days=0 means cleanup is skipped.
        assert_eq!(store.len(), 1);
    }

    #[test]
    fn should_report_regular_count_excluding_pinned_and_redacted() {
        let mut store = ClipboardStore::in_memory(200, 7);
        store.insert("regular", None);
        let id = store.insert("pinned", None);
        store.toggle_pin(id);
        store.insert_redacted(None);

        assert_eq!(store.regular_count(), 1);
    }
}
