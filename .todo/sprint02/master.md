# Sprint 02 — Dev Velocity & Quality

## Summary

Sprint 02 focuses on engineering throughput and regression resistance: a reliable dual-mode simulator, stronger frontend unit coverage on high-risk surfaces, practical coverage gates, maintainability refactors for oversized core files, and tighter CI signal quality. The goal is to make upcoming feature sprints faster and safer without adding work to Flint’s performance-critical runtime paths.

## Decisions

### In-Scope Items (Lean Scope: 5 Tickets)

1. Simulator dual-mode hardening (dev = real OpenCode proxy, test = deterministic mocks)
2. High-priority frontend component/hook tests
3. Coverage gates + fast local test paths
4. Maintainability refactor: split oversized core files
5. CI signal + runtime optimization

### Execution Tracking (Owner • Effort • Dependencies)

| Ticket | File                                                     | Owner | Effort | Dependencies |
| ------ | -------------------------------------------------------- | ----- | ------ | ------------ |
| 1      | `.todo/sprint02/1-simulator-dual-mode-hardening.md`      | TBD   | M      | None         |
| 2      | `.todo/sprint02/2-high-priority-frontend-tests.md`       | TBD   | M      | None         |
| 3      | `.todo/sprint02/3-coverage-gates-and-fast-test-paths.md` | TBD   | M      | 2            |
| 4      | `.todo/sprint02/4-split-oversized-core-files.md`         | TBD   | L      | None         |
| 5      | `.todo/sprint02/5-ci-signal-and-runtime-optimization.md` | TBD   | M      | 1, 3, 4      |

Owner assignment note: keep `TBD` until explicit assignees are confirmed.

Dependency note: ticket 4 is independent and can run in parallel with tickets 1–3; if merge conflict risk is high, land ticket 3 first to maximize refactor guardrails.

### Execution Board (Ready / Blocked / Done)

| Ticket | Status | Owner | Blocked By | Notes     |
| ------ | ------ | ----- | ---------- | --------- |
| 1      | Done   | TBD   | None       | Completed |
| 2      | Done   | TBD   | None       | Completed |
| 3      | Done   | TBD   | 2          | Completed |
| 4      | Done   | TBD   | None       | Completed |
| 5      | Done   | TBD   | 1, 3, 4    | Completed |

Status transition rules:

- **Ready → Blocked:** new dependency or external constraint appears.
- **Blocked → Ready:** all listed blockers resolved.
- **Ready/Blocked → Done:** acceptance criteria checked and verification commands pass.

### Sequence Rationale

- **Execution waves:**
  - **Wave A:** Ticket 1 and Ticket 2 in parallel.
  - **Wave B:** Ticket 3 after Ticket 2 baseline tests land.
  - **Wave C:** Ticket 4 can run in parallel (or merge after Wave B for safer landing).
  - **Wave D:** Ticket 5 finalizes CI policy once simulator hardening + coverage workflow are settled.
- **Why this sequencing:**
  - Ticket 1 and 2 are independent and parallelizable, reducing calendar time.
  - Ticket 3 should follow Ticket 2 so coverage gates are introduced on a stronger baseline.
  - Ticket 4 is technically independent but benefits from stronger guardrails if Wave B lands first.
  - Ticket 5 is last because it codifies and enforces decisions from earlier tickets.

### Execution Hygiene

- Prefer one PR per ticket; avoid bundling multiple sprint tickets into one branch.
- For Wave A parallel work, keep ownership/file boundaries explicit to reduce merge conflict risk.
- If Ticket 4 starts early, rebase it after Ticket 3 lands before final merge.
- Keep each ticket file’s acceptance checkboxes updated during implementation (not just at the end).

### Quality Bar (Per Ticket)

- Every ticket requires:
  - Unit tests for changed logic/modules.
  - Focused simulator E2E only when user-facing simulator behavior is affected.
  - No dead code or placeholder stubs left in production paths.

### Critical Path Guardrails

- **Overlay ready path:** no new network calls, disk I/O, or heavy computation on hotkey show path.
- **Result processing path:** no additional per-token expensive side effects in production chat render flow.
- Dev/simulator-only instrumentation must remain outside production runtime paths.

## Implementation

### Wave A — Parallel foundation (Tickets 1 + 2)

- Execute in parallel:
  - `.todo/sprint02/1-simulator-dual-mode-hardening.md`
  - `.todo/sprint02/2-high-priority-frontend-tests.md`
- Exit criteria:
  - `sim` and `sim:test` are explicitly separated and predictable.
  - SSE bridge lifecycle is stable (no duplicate streams/listeners).
  - Priority components/hooks have deterministic baseline tests.

### Wave B — Coverage workflow hardening (Ticket 3)

- Execute `.todo/sprint02/3-coverage-gates-and-fast-test-paths.md`
- Exit criteria:
  - Coverage checks are enforceable via gated test path.
  - Fast dev test loop remains available for day-to-day iteration.

### Wave C — Maintainability refactor (Ticket 4)

- Execute `.todo/sprint02/4-split-oversized-core-files.md`
- Exit criteria:
  - Target files are split into focused modules under 500 LOC (or materially reduced with rationale).
  - Public behavior remains unchanged.

### Wave D — CI signal + runtime optimization (Ticket 5)

- Execute `.todo/sprint02/5-ci-signal-and-runtime-optimization.md`
- Exit criteria:
  - CI enforces sprint guardrails with concise, actionable failure output.
  - Focused simulator regressions and coverage gating are wired without regressing baseline clarity.

## Verification Plan

- Per-ticket targeted tests/checks listed in each task file.
- Sprint-level checks after all 5:

```bash
just check
just test-gated
just test-quick
just test-frontend
just test-rust
just lint
just format
just test-e2e
```

## Definition of Done (Sprint)

- [x] Simulator dev/test modes are explicit and stable.
- [x] High-priority frontend component/hook coverage gaps are closed.
- [x] Coverage enforcement and quick test paths are both available and validated.
- [x] `commands.rs` and `kits/registry.rs` are split into focused modules.
- [x] CI includes actionable failures (artifacts/logs) and avoids unnecessary runtime bloat.
- [ ] No degradation introduced to overlay-ready or result-processing critical paths.

## Risks

- Simulator dev mode can be locally flaky when OpenCode server is unavailable.
- Coverage thresholds can block flow if initial baseline is set unrealistically high.
- Large refactors can create merge conflicts across active branches.
- CI runtime can regress if new checks are broad instead of focused.

## Out of Scope

- New major end-user features.
- Search architecture changes.
- New provider integrations or auth redesign.
- Broad design-system or UX overhauls unrelated to this sprint’s productivity theme.
