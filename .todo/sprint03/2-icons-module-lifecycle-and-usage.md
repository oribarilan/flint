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

- [ ] No dead-code errors from `src-tauri/src/icons.rs` in `just lint-rust`.
- [ ] Decision is documented (integrated now vs deferred with explicit boundary).
- [ ] Any call-site integration is covered by unit tests.

## Verification Commands

```bash
just lint-rust
just test-rust
```
