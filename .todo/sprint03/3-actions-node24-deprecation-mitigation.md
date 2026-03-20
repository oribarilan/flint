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

- [ ] CI runs no longer emit Node 20 deprecation warning, or warning is intentionally documented with a dated mitigation plan.
- [ ] Updated workflows remain green on representative PR run.
- [ ] Migration notes are documented in contributor/CI docs.

## Verification Commands

```bash
gh run list --workflow "Check" --limit 5
gh run view <run-id> --log
```
