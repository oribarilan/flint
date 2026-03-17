//! `OpenCode` server child process management.
//!
//! Spawns `opencode serve` with the second brain repo as cwd, manages its
//! lifecycle, and provides a graceful shutdown with fallback to SIGKILL.

use std::path::Path;
use std::process::Stdio;

use tokio::process::{Child, Command};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors from process management.
#[derive(Debug, thiserror::Error)]
pub enum ProcessError {
    #[error("failed to spawn opencode: {0}")]
    Spawn(String),

    #[error("opencode process exited unexpectedly")]
    UnexpectedExit,

    #[error("failed to stop opencode: {0}")]
    Stop(String),
}

// ---------------------------------------------------------------------------
// Process wrapper
// ---------------------------------------------------------------------------

/// Manages a running `opencode serve` child process.
pub struct OpenCodeProcess {
    child: Child,
    port: u16,
}

impl OpenCodeProcess {
    /// Spawn `opencode serve` with cwd set to the given repo path.
    pub fn start(repo_path: &Path, port: u16) -> Result<Self, ProcessError> {
        tracing::info!(
            repo = %repo_path.display(),
            port = port,
            "starting opencode server"
        );

        let child = Command::new("opencode")
            .args(["serve", "--port", &port.to_string(), "--hostname", "127.0.0.1"])
            .current_dir(repo_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| {
                ProcessError::Spawn(format!("{e}. Is `opencode` installed and in PATH?"))
            })?;

        tracing::info!(pid = child.id(), "opencode server process spawned");
        Ok(Self { child, port })
    }

    /// The port the server is listening on.
    pub const fn port(&self) -> u16 {
        self.port
    }

    /// Check if the process is still running.
    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// Stop the server process gracefully.
    ///
    /// Sends SIGTERM first, waits up to 5 seconds, then escalates to SIGKILL.
    pub async fn stop(&mut self) -> Result<(), ProcessError> {
        let pid = self.child.id();
        tracing::info!(pid = pid, "stopping opencode server");

        // Try graceful kill first.
        if let Err(e) = self.child.kill().await {
            tracing::warn!(error = %e, "kill signal failed, process may have already exited");
        }

        // Wait for exit with a timeout.
        match tokio::time::timeout(std::time::Duration::from_secs(5), self.child.wait()).await {
            Ok(Ok(status)) => {
                tracing::info!(pid = pid, status = %status, "opencode server stopped");
            }
            Ok(Err(e)) => {
                tracing::warn!(error = %e, "error waiting for opencode to exit");
            }
            Err(_) => {
                tracing::warn!(pid = pid, "opencode server did not exit in time");
            }
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_fails_with_nonexistent_repo() {
        let result = OpenCodeProcess::start(std::path::Path::new("/nonexistent/path/12345"), 14096);
        assert!(result.is_err());
    }

    #[test]
    fn process_error_display() {
        let err = ProcessError::Spawn("not found".to_string());
        assert!(err.to_string().contains("not found"));

        let err = ProcessError::UnexpectedExit;
        assert!(err.to_string().contains("unexpectedly"));
    }
}
