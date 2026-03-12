---
name: crossplatform
description: "Detailed reference for writing cross-platform Rust code with conditional compilation. Use when writing or reviewing platform-specific code, #[cfg] attributes, or Cargo.toml platform dependencies."
---

# Cross-Platform Rust Patterns

## Core Rules

### `#[cfg]` vs `cfg!()`

- **`#[cfg(...)]`** — Compile-time. Code is removed entirely if condition is false. Use for platform-specific types, imports, and functions.
- **`cfg!(...)`** — Runtime boolean. Code is still type-checked on all platforms. Only use for trivial branching on primitive values.

```rust
// CORRECT: platform-specific import removed on other targets
#[cfg(target_os = "windows")]
fn windows_only() {
    use std::os::windows::fs::MetadataExt;
}

// WRONG: type error on Linux/macOS
fn may_fail() {
    if cfg!(target_os = "windows") {
        use std::os::windows::fs::MetadataExt; // compile error on non-Windows!
    }
}
```

### Scope Imports Inside `#[cfg]` Blocks

Never use `#[allow(unused_imports)]` to suppress cross-platform warnings. Scope the import to where it's used:

```rust
// CORRECT
#[cfg(windows)]
fn configure_command(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000);
}

// WRONG
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;
```

### Prefer Families Over Specific OS

```rust
// Prefer this (covers Linux, macOS, BSDs)
#[cfg(unix)]
fn set_permissions() { /* ... */ }

// Over this (misses macOS, BSDs)
#[cfg(target_os = "linux")]
fn set_permissions() { /* ... */ }
```

Use specific `target_os` only when behavior genuinely differs between Unix variants (e.g., macOS `Library/Application Support` vs XDG on Linux).

## Module Organization Pattern

Isolate platform code into separate modules with a unified public interface:

```rust
// lib.rs
#[cfg(target_os = "windows")]
#[path = "platform/windows.rs"]
mod platform;

#[cfg(target_os = "macos")]
#[path = "platform/macos.rs"]
mod platform;

#[cfg(target_os = "linux")]
#[path = "platform/linux.rs"]
mod platform;

pub use platform::open_file;
```

Each platform module implements the same public function signatures.

## Platform-Specific Config Paths

```rust
use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        return std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
    }

    #[cfg(target_os = "macos")]
    {
        return std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Library/Application Support"))
            .unwrap_or_else(|| PathBuf::from("."));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME") {
            return PathBuf::from(xdg);
        }
        return std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(".config"))
            .unwrap_or_else(|| PathBuf::from("."));
    }
}
```

## Cargo.toml Platform Dependencies

```toml
[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }

[target.'cfg(windows)'.dependencies]
winapi = { version = "0.3", features = ["winuser", "winbase"] }

[target.'cfg(target_os = "macos")'.dependencies]
cocoa = "0.26"

[target.'cfg(unix)'.dependencies]
nix = "0.29"
```

**Note:** `cfg(feature = "...")` does NOT work in `[target.'cfg(...)'.dependencies]`. Use `[features]` + optional deps instead.

## Conditional Derives and Attributes

```rust
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Config {
    pub value: u32,
}
```

## Testing Across Platforms

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_dir_is_valid() {
        let dir = config_dir();
        assert!(dir.is_absolute() || dir == PathBuf::from("."));
    }

    #[test]
    #[cfg(unix)]
    fn test_unix_specific_behavior() {
        // Unix-only test
    }

    #[test]
    #[cfg(windows)]
    fn test_windows_specific_behavior() {
        // Windows-only test
    }
}
```

## Quick Reference

| Predicate | Values |
|-----------|--------|
| `target_os` | `"windows"`, `"linux"`, `"macos"`, `"ios"`, `"android"` |
| `target_family` | `"unix"`, `"windows"`, `"wasm"` |
| `target_arch` | `"x86_64"`, `"aarch64"`, `"arm"` |
| `unix` | Shorthand for any Unix-like OS |
| `windows` | Shorthand for any Windows OS |

Combine with `all()`, `any()`, `not()`:
```rust
#[cfg(all(unix, target_arch = "x86_64"))]
#[cfg(any(target_os = "linux", target_os = "freebsd"))]
#[cfg(not(target_os = "windows"))]
```

Verify available predicates: `rustc --print=cfg --target=<triple>`
