# Sprint02-4: Split Oversized Core Files (`commands.rs`, `kits/registry.rs`)

## Summary

Two large Rust files exceed the project’s maintainability guardrail and concentrate too much responsibility. This ticket decomposes them into domain-focused modules while preserving command interfaces, behavior, and test coverage.

This sprint ticket is intentionally scoped to `commands.rs` and `kits/registry.rs` only (not the wider oversized-file backlog).

## Requirements

- Keep public API behavior unchanged.
- Reduce oversized files below 500 LOC where feasible.
- Separate concerns by domain with clear module boundaries.
- Maintain or improve test coverage during refactor.

## Implementation

### Scope

1. Split `src-tauri/src/commands.rs` by domain.
2. Split `src-tauri/src/kits/registry.rs` into focused support modules.
3. Move/adjust tests with extracted logic.
4. Ensure no command naming or IPC route regressions.

### Proposed Changes

- **Commands split**
  - New module layout under `src-tauri/src/commands/`:
    - `agent.rs`
    - `config.rs`
    - `files.rs`
    - `kits.rs`
    - `search.rs` (if needed)
    - `mod.rs` re-exporting command fns for Tauri registration

- **Registry split**
  - Extract likely domains from `kits/registry.rs`:
    - core action builders
    - conversion/mapping helpers
    - task execution/dispatch helpers
  - Keep top-level registry orchestration in `registry.rs` or `registry/mod.rs`.

- **Refactor hygiene**
  - Prefer `pub(crate)` visibility for internal modules.
  - Keep function-level behavior unchanged unless bugfix is explicitly required.

- **Migration safety**
  - Move code first, then run formatting/tests before any behavior edits.
  - Keep command function names stable to avoid Tauri invoke breakage.
  - Preserve existing test intent; relocate tests with extracted modules where practical.

### Related Files

- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/kits/registry.rs`
- `src-tauri/src/kits/mod.rs`
- Related Rust unit/integration tests
- `.todo/split-large-files.md` (reference only; do not expand this sprint scope)

## Acceptance Criteria

- [x] `commands.rs` is decomposed into domain modules with unchanged command surface.
- [x] `kits/registry.rs` responsibilities are split into focused modules.
- [x] Target files are under 500 LOC or materially reduced with clear rationale.
- [x] Rust tests and lint pass after refactor.

## Task Tracker

- **Status:** Done
- **Owner:** TBD
- **Blocked By:** None
- **Unblocks:** Ticket 5

## Verification

- `just test-rust`
- `just lint-rust`
- `just build-rust`

## Verification Commands

```bash
just test-rust
just lint-rust
just build-rust
```

## Implementation Checklist

- [x] Create `src-tauri/src/commands/` module structure and re-export surface in `commands/mod.rs`.
- [x] Move command groups without changing external command names.
- [x] Split `kits/registry.rs` internals into focused helper modules.
- [x] Relocate/update tests for extracted modules.
- [x] Run `just test-rust`, `just lint-rust`, `just build-rust`.
- [x] Confirm `tauri::generate_handler!` call sites remain unchanged in behavior.

## Risks

- Refactor can introduce subtle command wiring regressions.
- Large moves can increase merge conflict risk with parallel work.

## Out of Scope

- Functional redesign of kit architecture.
- Introducing new commands unrelated to module split.
- Splitting other oversized files listed in `.todo/split-large-files.md`.
