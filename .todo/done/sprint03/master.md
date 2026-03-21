# Sprint 03 — CI Stability & Platform Hygiene

## Summary

Sprint 03 focuses on converting the current CI baseline from noisy/failing to reliable across platforms. The immediate priority is resolving cross-platform Rust Clippy failures in the matrix `check` job, then addressing upcoming GitHub Actions runtime/deprecation risks (Node 20 action deprecation) and CI ergonomics gaps. The goal is deterministic, actionable CI that matches local expectations without weakening quality gates.

## Decisions

### In-Scope Items (Initial)

1. Fix cross-platform Clippy failures blocking `check` on Ubuntu/Windows.
2. Establish a stable strategy for currently-unused icon extraction code (`src-tauri/src/icons.rs`) so dead-code warnings stop breaking CI.
3. Update GitHub Actions workflow to handle Node 20 action deprecation proactively.
4. Improve CI failure diagnostics and runtime observability docs for follow-up sprints.

### Evidence Baseline

- Representative PR workflow run: `https://github.com/oribarilan/flint/actions/runs/23320457402`
- `sprint01-chat-e2e` runtime budget: PASS (51s <= 8m)
- Matrix `check` failures are from Rust lint (`lint-rust`) on Ubuntu/Windows.

Key diagnostics extracted from failed jobs:

- `src-tauri/src/commands.rs:275` — `unused_mut`
- `src-tauri/src/commands.rs:541` — `clippy::map_unwrap_or`
- `src-tauri/src/icons.rs` — dead code warnings (`PREFERRED_TYPES`, `PNG_MAGIC`, `extract_app_icon`, `resolve_icns_path`, `extract_png_from_icns`, `parse_icns_entries`)
- `src-tauri/src/kits/window_management.rs:259` — `clippy::redundant_locals`
- `src-tauri/src/kits/window_management.rs:303` — `clippy::trim_split_whitespace`
- Windows-specific additional failures:
  - `src-tauri/src/focus.rs:102`, `:106` — `clippy::missing_const_for_fn`
  - `src-tauri/src/kits/window_management.rs:338` — `clippy::unused_async`
- Actions warning: Node 20 deprecation for `actions/checkout@v4`, `actions/setup-node@v4`.

### Current Status Snapshot (2026-03-21)

- Ticket 1: **Implemented locally; partially verified in CI**
  - Rust/Clippy failure class resolved locally (`just lint-rust`, `just check` pass).
  - Representative run `23342082444` shows Ubuntu/macOS check green; Windows failed on frontend formatting (`format-frontend`), not Clippy.
- Ticket 2: **Done**
  - `icons.rs` lifecycle decision finalized: active macOS-only feature + platform gating boundary.
  - Added macOS call-site unit coverage in `commands/files.rs`.
- Ticket 3: **In progress**
  - Workflow upgraded to Node 24-compatible action majors (`checkout@v6`, `setup-node@v6`).
  - Pending representative CI run evidence post-change.
- Ticket 4: **Done**
  - CI triage + runtime observability guidance documented in `CONTRIBUTE.md`.

- Additional stabilization in this sprint:
  - Added repository `.gitattributes` to normalize LF line endings and reduce cross-platform Prettier churn.

## Implementation

### Ticket Plan

1. `.todo/sprint03/1-fix-cross-platform-clippy-breakages.md`
2. `.todo/sprint03/2-icons-module-lifecycle-and-usage.md`
3. `.todo/sprint03/3-actions-node24-deprecation-mitigation.md`
4. `.todo/sprint03/4-ci-diagnostics-and-runtime-observability.md`

### Execution Notes

- Ticket 1 is highest priority and unblocks green matrix checks.
- Ticket 2 can run in parallel if it doesn't conflict with Ticket 1 edits.
- Ticket 3 should land after confirming current action compatibility.
- Ticket 4 finalizes docs/diagnostic guidance after technical fixes are in place.

## Definition of Done (Sprint)

- [ ] `check` workflow matrix is green (macOS, Ubuntu, Windows) for representative PR runs.
- [x] `sprint01-chat-e2e` remains <= 8 minutes and continues passing.
- [ ] Node 20 deprecation risk is mitigated or explicitly pinned with documented contingency.
- [x] CI failure triage is documented with reproducible local commands and log mapping.

## Finalization Decision

- 2026-03-21: Finalized by explicit user request **without waiting on additional `check.yml` representative CI evidence**.
- Remaining deferred validation:
  - post-change representative matrix run proving all `check` legs green,
  - post-change CI log confirmation that Node 20 action deprecation warning no longer appears.
- Local verification completed before finalization:
  - `just check` ✅
  - `just lint-rust` ✅
  - `just test-rust` ✅
  - `npm run format:check` ✅
