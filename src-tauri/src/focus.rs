//! Capture and restore the frontmost application before/after showing Flint.
//!
//! Platform-specific: uses `osascript` on macOS, `xdotool` on Linux,
//! and a stub on Windows (pending Win32 API integration).

use std::sync::Mutex;

/// Stores the identifier of the previously frontmost app.
static PREVIOUS_APP: Mutex<Option<String>> = Mutex::new(None);

/// Capture the currently frontmost application (call before showing Flint).
pub fn capture_frontmost_app() {
    if let Some(id) = platform::get_frontmost_app() {
        tracing::debug!(app = %id, "captured frontmost app");
        if let Ok(mut prev) = PREVIOUS_APP.lock() {
            *prev = Some(id);
        }
    }
}

/// Restore focus to the previously captured application (call after hiding Flint).
pub fn restore_previous_app() {
    let app_id = PREVIOUS_APP.lock().ok().and_then(|mut prev| prev.take());
    if let Some(id) = app_id {
        tracing::debug!(app = %id, "restoring focus to previous app");
        platform::activate_app(&id);
    }
}

// ---------------------------------------------------------------------------
// macOS
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod platform {
    use std::process::Command;

    /// Get the bundle identifier of the frontmost application via `AppleScript`.
    pub fn get_frontmost_app() -> Option<String> {
        let output = Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to get bundle identifier \
                 of first application process whose frontmost is true",
            ])
            .output()
            .ok()?;

        let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if id.is_empty() || id == "missing value" {
            None
        } else {
            Some(id)
        }
    }

    /// Activate a running application by bundle identifier.
    ///
    /// Uses System Events so it won't launch the app if it's already closed.
    pub fn activate_app(bundle_id: &str) {
        let script = format!(
            "tell application \"System Events\" to set frontmost of every process \
             whose bundle identifier is \"{bundle_id}\" to true"
        );
        let _ = Command::new("osascript").args(["-e", &script]).output();
    }
}

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

#[cfg(target_os = "linux")]
mod platform {
    use std::process::Command;

    /// Get the active window ID via `xdotool`.
    pub fn get_frontmost_app() -> Option<String> {
        let output = Command::new("xdotool").args(["getactivewindow"]).output().ok()?;
        let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if id.is_empty() {
            None
        } else {
            Some(id)
        }
    }

    /// Activate a window by its ID via `xdotool`.
    pub fn activate_app(window_id: &str) {
        let _ = Command::new("xdotool").args(["windowactivate", window_id]).output();
    }
}

// ---------------------------------------------------------------------------
// Windows (stub)
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod platform {
    /// Stub — Windows support requires the `windows` crate for
    /// `GetForegroundWindow` / `SetForegroundWindow`.
    pub const fn get_frontmost_app() -> Option<String> {
        None
    }

    pub const fn activate_app(_handle: &str) {
        // No-op until Win32 API support is added.
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_and_restore_roundtrip() {
        // Reset state
        if let Ok(mut prev) = PREVIOUS_APP.lock() {
            *prev = None;
        }

        // Restore with nothing captured should be a no-op
        restore_previous_app();

        // After capture, previous should be set (on supported platforms)
        capture_frontmost_app();

        // Restore clears the stored value
        restore_previous_app();
        let stored = PREVIOUS_APP.lock().ok().and_then(|p| p.clone());
        assert!(stored.is_none(), "previous app should be cleared after restore");
    }
}
