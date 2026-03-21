# Sprint02-3: Coverage Gates + Fast Local Test Paths

## Summary

Introduce practical coverage enforcement while preserving a fast feedback loop for daily development. Add an explicit gated path for coverage checks while keeping quick variants for active coding.

## Requirements

- `just test-gated` enforces coverage for Rust + frontend.
- `just test` remains a non-coverage baseline (aligned with current contributor expectations and `just check`).
- Thresholds should be strict but realistic for current baseline.
- `just test-quick`, `test-rust-quick`, and `test-frontend-quick` remain available.
- Tooling setup should be documented and reproducible.

## Implementation

### Scope

1. Add frontend coverage provider/config and thresholds.
2. Add Rust coverage command path (using `cargo-llvm-cov`).
3. Update `justfile` recipes for gated and quick modes.
4. Add setup/install recipe and contributor notes.

### Proposed Changes

- **Frontend**
  - Configure Vitest coverage in `vite.config.ts`.
  - Update npm scripts in `package.json` for coverage + quick mode.

- **Rust**
  - Add `test-rust-gated` via `cargo llvm-cov` with fail-under threshold.
  - Keep `test-rust`/`test-rust-quick` on plain `cargo test`.

- **Task runner**
  - Update `justfile` with:
    - `test-gated` (coverage-enforced)
    - `test-quick`
    - stack-specific gated/quick variants
    - optional `setup` tooling bootstrap

- **Threshold policy**
  - Start with realistic per-stack thresholds based on current baseline.
  - Ratchet upward in later sprints rather than blocking Sprint 02 on aspirational numbers.

### Related Files

- `justfile`
- `package.json`
- `vite.config.ts`
- `README.md` or `CONTRIBUTE.md` (if test workflow docs are updated)

## Acceptance Criteria

- [x] `just test-gated` fails when coverage is below thresholds.
- [x] `just test-quick` exists and runs without coverage overhead.
- [x] Frontend and Rust coverage commands both run locally.
- [x] Setup instructions for required tools are documented.

## Task Tracker

- **Status:** Done
- **Owner:** TBD
- **Blocked By:** Ticket 2
- **Unblocks:** Ticket 5

## Verification

- `just test-rust-gated`
- `just test-frontend-gated`
- `just test-gated`
- `just test-quick`

## Verification Commands

```bash
just test-rust-gated
just test-frontend-gated
just test-gated
just test-quick
```

## Notes

- Keep `just check` behavior stable unless a separate explicit decision changes CI baseline policy.

## Implementation Checklist

- [x] Add frontend coverage config + fail-under thresholds.
- [x] Add Rust coverage command path (`cargo llvm-cov`) + fail-under threshold.
- [x] Add `just test-gated` and stack-specific gated commands.
- [x] Keep/update quick paths: `test-quick`, `test-rust-quick`, `test-frontend-quick`.
- [x] Document setup commands/tools in `CONTRIBUTE.md`.
- [x] Validate all four flows: gated Rust, gated frontend, combined gated, combined quick.

## Risks

- Threshold set too high can immediately block normal development.
- Coverage tooling installation friction across environments.

## Out of Scope

- Mandating 100% coverage.
- Rewriting large modules solely to satisfy coverage metrics.
