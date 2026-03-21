# Sprint03-3: Mitigate GitHub Actions Node 20 Deprecation Risk

## Summary

GitHub Actions warns that Node 20 runtime for actions is deprecated and will default to Node 24 in June 2026. This ticket proactively updates CI workflows/actions usage to avoid surprise breakage.

## Requirements

- Audit all workflow actions that currently run on Node 20 runtime.
- Upgrade/pin to compatible action versions that support Node 24.
- If immediate migration is risky, document temporary mitigation flags and rollback path.
- Keep workflow behavior/functionality unchanged.

## Evidence

Warning currently emitted in CI runs:

- `actions/checkout@v4`
- `actions/setup-node@v4`

## Acceptance Criteria

- [x] CI runs no longer emit Node 20 deprecation warning, or warning is intentionally documented with a dated mitigation plan.
- [ ] Updated workflows remain green on representative PR run.
- [x] Migration notes are documented in contributor/CI docs.

## Verification Commands

```bash
gh run list --workflow "Check" --limit 5
gh run view <run-id> --log
```

## Progress / Notes

- 2026-03-21: Audited action versions and upgraded Node 20 runtime actions in `.github/workflows/check.yml`:
  - `actions/checkout@v4` → `actions/checkout@v6`
  - `actions/setup-node@v4` → `actions/setup-node@v6`
- Upstream compatibility evidence:
  - `actions/checkout` latest release: `v6.0.2`
  - `actions/setup-node` latest release: `v6.3.0`
- Baseline warning reference (pre-change):
  - Run `23342082444` emitted Node 20 deprecation warning naming `@v4` actions.
- Added migration note in `CONTRIBUTE.md` under CI triage section.
- Remaining acceptance item requires representative PR run(s) after this change to confirm green behavior and warning removal in actual CI logs.
