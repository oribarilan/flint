//! Background task lifecycle management for a single kit.

use tokio::task::AbortHandle;

/// Manages background tasks spawned by a single kit.
///
/// Tasks are tracked via [`AbortHandle`] so they can be cancelled on
/// kit disable or app shutdown without the kit managing its own cleanup.
#[derive(Default)]
pub struct TaskManager {
    handles: Vec<AbortHandle>,
}

impl TaskManager {
    /// Create an empty task manager.
    pub fn new() -> Self {
        Self::default()
    }

    /// Spawn a background task and track its handle for cleanup.
    pub fn spawn<F>(&mut self, future: F)
    where
        F: std::future::Future<Output = ()> + Send + 'static,
    {
        let handle = tokio::spawn(future);
        self.handles.push(handle.abort_handle());
    }

    /// Abort all tracked tasks.
    pub fn abort_all(&self) {
        for handle in &self.handles {
            handle.abort();
        }
    }

    /// Number of tracked tasks.
    #[cfg(test)]
    pub const fn len(&self) -> usize {
        self.handles.len()
    }
}
