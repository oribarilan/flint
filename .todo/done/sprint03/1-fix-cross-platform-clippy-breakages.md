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

- [x] `just lint-rust` passes locally.
- [x] `just check` passes locally.
- [ ] Representative PR `check` matrix passes on Ubuntu/Windows for this ticket.

## Verification Commands

```bash
just lint-rust
just check
```

## Progress / Notes

- 2026-03-20: Implemented cross-platform lint fixes for reported CI failures:
  - `src-tauri/src/commands/search.rs`: removed non-macOS-only `unused_mut` by splitting mutable/non-mutable bindings behind `#[cfg]`.
  - `src-tauri/src/commands/files.rs`: replaced `map(...).unwrap_or_else(...)` with `map_or_else(...)`.
  - `src-tauri/src/kits/window_management.rs`:
    - removed redundant local rebinding,
    - removed `trim()` before `split_whitespace()`,
    - made Windows stub `tile_window` synchronous and added cfg-specific call sites in `execute`.
  - `src-tauri/src/focus.rs`: made Windows stub helpers `const fn` to satisfy Clippy.
  - `src-tauri/src/lib.rs`: gated `mod icons;` to macOS so Linux/Windows CI does not fail on macOS-only dead code.
- Local verification:
  - `just lint-rust` ✅
  - `just check` ✅
- Remaining acceptance item requires a representative PR run to confirm Ubuntu/Windows matrix green.
- Additional CI diagnosis (run `23342082444`):
  - `check (ubuntu-latest)` ✅
  - `check (macos-latest)` ✅
  - `check (windows-latest)` ❌ due to `format-frontend`/Prettier line-ending diffs (not Rust/Clippy).
  - This ticket’s Clippy failures are functionally resolved; remaining matrix instability moved to Sprint03 CI/runtime hygiene work.
