# Sprint03-2: Resolve `icons.rs` Dead-Code CI Failures

## Summary

`src-tauri/src/icons.rs` currently triggers dead-code errors in CI because exported/public helpers are not referenced in production paths. This ticket decides and implements the correct lifecycle: integrate icon extraction where intended, or explicitly gate/archive the module to avoid false-positive failures.

## Requirements

- Make `icons.rs` lint-clean under current strict lint policy.
- Keep architecture intent explicit (active feature vs deferred feature).
- Avoid suppressing warnings globally; prefer structural resolution.
- Document the decision in task notes.

## Evidence

Current dead-code failures include:

- `PREFERRED_TYPES`, `PNG_MAGIC`
- `extract_app_icon`
- `resolve_icns_path`
- `extract_png_from_icns`
- `parse_icns_entries`

## Acceptance Criteria

- [x] No dead-code errors from `src-tauri/src/icons.rs` in `just lint-rust`.
- [x] Decision is documented (integrated now vs deferred with explicit boundary).
- [x] Any call-site integration is covered by unit tests.

## Verification Commands

```bash
just lint-rust
just test-rust
```

## Progress / Notes

- 2026-03-21: Confirmed icon extraction is an **active macOS-only feature** (not deferred):
  - `get_app_icon` command calls `crate::icons::extract_app_icon` on macOS.
  - `mod icons;` is gated behind `#[cfg(target_os = "macos")]` in `src-tauri/src/lib.rs` so non-macOS targets do not lint/build dead code for this module.
- Added macOS unit test coverage for call-site behavior:
  - `src-tauri/src/commands/files.rs` → `get_app_icon_returns_none_for_missing_bundle` (`#[cfg(target_os = "macos")]`).
- Local verification:
  - `just lint-rust` ✅
  - `just test-rust` ✅ (includes `icons::tests::*` + new `get_app_icon` command test on macOS).
