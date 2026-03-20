# Sprint01-6: CI Check Workflow Baseline

## Summary

Add a lean GitHub Actions workflow that runs core checks for Rust and frontend changes so sprint01 behavior is guarded in PRs. This ticket prioritizes reliability over breadth: fast, deterministic checks that catch regressions early without creating excessive CI time.

## Requirements

- Extend existing `check.yml` under `.github/workflows/`.
- Run essential quality gates used by local development.
- Include focused chat regression tests introduced in sprint01.

## Implementation

### Scope

1. **Extend** existing `check.yml` — do not replace it. The 3-OS matrix for `just check` (lint/test/build) already exists and runs correctly.
2. Add a new job (or step) that runs only the focused sprint01 chat E2E spec(s) against the simulator.
3. On Linux: wrap Playwright with `xvfb-run` (or use `xvfb-run -a` in the step) to provide a display for headed Chromium.
4. Ensure caching strategy keeps runtime reasonable.
5. Gate PRs on the new E2E job as a required check.

### Proposed Checks

- **Already covered by existing `check.yml`** (no changes needed):
  - Rust: format check, clippy/lint, tests
  - Frontend: lint, unit tests
- **New — to add in this ticket:**
  - Focused E2E: run only sprint01 chat regression spec(s) (not full broad suite)
  - Linux display: `xvfb-run` wrapper for Playwright headless

### Related Files

- `.github/workflows/check.yml` (**already exists** — 3-OS matrix running `just check` for Rust + frontend lint/test/build. Do not recreate. The remaining work for this ticket is: (1) add an E2E step running only the sprint01 chat regression spec(s), (2) add `xvfb-run` wrapping on the Linux runner for headless Playwright.)
- `justfile` (if minor recipe alignment needed)
- `simulator/tests/` (for targeted command integration)

## Acceptance Criteria

- [ ] Existing 3-OS `just check` jobs remain unchanged and passing.
- [ ] New E2E job runs focused sprint01 chat regression spec(s) on every PR.
- [ ] Linux runner uses `xvfb-run` so Playwright passes headlessly.
- [ ] Workflow runtime target is documented and stays within target for representative PRs.
- [ ] Local reproducibility instructions are clear in task notes or docs.

## Rollout Notes

- Validate the updated workflow on a representative branch before enforcing as required in repository settings.
- If existing unrelated failures block required-check rollout, land focused fixes first, then enforce required status.

## Verification

- Validate workflow syntax and dry-run approach where possible.
- Open PR/check run confirms jobs execute successfully on representative branch.

## Risks

- CI environment differences vs local simulator behavior.
- Workflow bloat if full E2E is accidentally included.

## Out of Scope

- Multi-OS matrix expansion beyond lean baseline.
- Release/bundle pipelines.
