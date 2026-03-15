//! Clipboard watcher — background task monitoring the system clipboard.
//!
//! Platform-specific change detection:
//! - **macOS**: `NSPasteboard.changeCount` (cheap integer comparison).
//! - **Windows**: `AddClipboardFormatListener` (event-driven — deferred to
//!   platform-specific impl, for now uses polling like Linux).
//! - **Linux**: Content equality check (compare with last known content).
//!
//! The watcher runs as a background task managed by `TaskManager`.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::RwLock;

use super::privacy;
use super::store::ClipboardStore;

/// Maximum content size to capture (100 KB).
const MAX_CONTENT_SIZE: usize = 100 * 1024;

/// Configuration for the clipboard watcher.
#[derive(Debug, Clone)]
pub struct WatcherConfig {
    /// Polling interval in milliseconds.
    pub poll_interval_ms: u64,
    /// Apps whose clipboard writes are ignored.
    pub excluded_apps: Vec<String>,
    /// Whether to run secret-like content detection.
    pub sensitive_detection: bool,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self { poll_interval_ms: 500, excluded_apps: Vec::new(), sensitive_detection: true }
    }
}

/// Run the clipboard watcher loop.
///
/// This is designed to be spawned as a background task via `TaskManager`.
/// It polls the system clipboard at the configured interval, detects changes,
/// applies privacy filters, and stores entries.
#[allow(clippy::significant_drop_tightening)] // guard must be held while reading sorted entries
pub async fn run(store: Arc<RwLock<ClipboardStore>>, config: WatcherConfig) {
    let interval = Duration::from_millis(config.poll_interval_ms);
    let mut last_content: Option<String> = None;

    // Read the most recent entry to seed `last_content` so we don't
    // re-capture whatever is already on the clipboard at startup.
    {
        let store_guard = store.read().await;
        let sorted = store_guard.all_sorted();
        if let Some(entry) = sorted.first() {
            if !entry.redacted {
                last_content = Some(entry.full_content.clone());
            }
        }
    }

    loop {
        tokio::time::sleep(interval).await;

        let Some(current) = read_clipboard_text() else { continue };

        // Content equality check — skip if unchanged.
        if last_content.as_deref() == Some(&current) {
            continue;
        }
        last_content = Some(current.clone());

        // Size check.
        if current.len() > MAX_CONTENT_SIZE {
            tracing::debug!(size = current.len(), "clipboard content exceeds max size, skipping");
            continue;
        }

        // Empty content check.
        if current.trim().is_empty() {
            continue;
        }

        // Source app detection (best-effort).
        let source_app = detect_source_app();

        // Excluded apps check.
        if privacy::is_excluded_app(source_app.as_deref(), &config.excluded_apps) {
            tracing::debug!(
                app = ?source_app,
                "clipboard content from excluded app, skipping"
            );
            continue;
        }

        // Secret-like content detection.
        if config.sensitive_detection && privacy::looks_like_secret(&current) {
            tracing::debug!("clipboard content looks like a secret, storing redacted placeholder");
            store.write().await.insert_redacted(source_app);
            continue;
        }

        // Store the entry (dedup handled internally).
        store.write().await.insert(&current, source_app);
    }
}

// ---------------------------------------------------------------------------
// Platform: clipboard reading
// ---------------------------------------------------------------------------

/// Read the current text content from the system clipboard.
///
/// Returns `None` if the clipboard is empty, contains non-text content,
/// or cannot be read.
fn read_clipboard_text() -> Option<String> {
    // `arboard` handles platform differences internally.
    let mut clipboard = arboard::Clipboard::new().ok()?;
    clipboard.get_text().ok()
}

// ---------------------------------------------------------------------------
// Platform: source app detection (best-effort)
// ---------------------------------------------------------------------------

/// Detect the foreground application that likely wrote to the clipboard.
///
/// This is best-effort — the foreground app at poll time may not be the app
/// that actually wrote to the clipboard if the user switched apps quickly.
#[cfg(target_os = "macos")]
const fn detect_source_app() -> Option<String> {
    // On macOS, use NSWorkspace to get the frontmost application.
    // For now, return None — implementing Objective-C interop is deferred.
    // The excluded apps list relies on this, but concealed marker detection
    // (also deferred) is the real safety net for password managers.
    None
}

#[cfg(target_os = "windows")]
const fn detect_source_app() -> Option<String> {
    None
}

#[cfg(target_os = "linux")]
const fn detect_source_app() -> Option<String> {
    None
}

// Fallback for other platforms / test builds.
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
const fn detect_source_app() -> Option<String> {
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watcher_config_has_sensible_defaults() {
        let config = WatcherConfig::default();
        assert_eq!(config.poll_interval_ms, 500);
        assert!(config.excluded_apps.is_empty());
        assert!(config.sensitive_detection);
    }

    #[test]
    fn max_content_size_is_100kb() {
        assert_eq!(MAX_CONTENT_SIZE, 100 * 1024);
    }
}
