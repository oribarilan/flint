//! Lightweight error helpers for Tauri IPC boundaries.
//!
//! Tauri commands return `Result<T, String>`, so we need a concise way
//! to convert library errors into `String`. This trait eliminates the
//! repetitive `.map_err(|e| e.to_string())` pattern.

/// Extension trait to convert any `Result<T, E: Display>` into `Result<T, String>`.
pub trait StringResult<T> {
    /// Convert the error variant to a `String`.
    fn str_err(self) -> Result<T, String>;
}

impl<T, E: std::fmt::Display> StringResult<T> for Result<T, E> {
    fn str_err(self) -> Result<T, String> {
        self.map_err(|e| e.to_string())
    }
}
