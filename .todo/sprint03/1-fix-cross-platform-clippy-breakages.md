# Sprint03-1: Fix Cross-Platform Clippy Breakages in `check` Matrix

## Summary

The matrix `check` job is currently failing on Ubuntu and Windows due to Rust/Clippy errors promoted by `-D warnings`. This ticket restores CI signal by fixing all reported diagnostics without weakening lint settings.

## Requirements

- Keep `cargo clippy -- -D warnings` strictness unchanged.
- Fix all currently reported Clippy failures in affected files.
- Preserve runtime behavior and platform boundaries.
- Add/adjust tests if behavior-affecting changes are needed.

## Evidence (from run 23320457402)

- `src-tauri/src/commands.rs:275` (`unused_mut`)
- `src-tauri/src/commands.rs:541` (`clippy::map_unwrap_or`)
- `src-tauri/src/kits/window_management.rs:259` (`clippy::redundant_locals`)
- `src-tauri/src/kits/window_management.rs:303` (`clippy::trim_split_whitespace`)
- `src-tauri/src/focus.rs:102`, `:106` (`clippy::missing_const_for_fn`, Windows)
- `src-tauri/src/kits/window_management.rs:338` (`clippy::unused_async`, Windows)

## Acceptance Criteria

- [ ] `just lint-rust` passes locally.
- [ ] `just check` passes locally.
- [ ] Representative PR `check` matrix passes on Ubuntu/Windows for this ticket.

## Verification Commands

```bash
just lint-rust
just check
```
