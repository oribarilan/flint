# CI Pipeline

## Summary

Set up GitHub Actions CI that runs `just check` (lint + format + test + build) on every PR and push to main. Same gate as local development — no CI-specific scripts.

## Requirements

- Runs on all three platforms (macOS, Windows, Linux).
- Single workflow that runs `just check` — no duplicated/divergent CI logic.
- Must install: Rust (stable), Node.js (≥18), `just`, Tauri system dependencies per platform.
- Cache `~/.cargo`, `target/`, and `node_modules/` for speed.

## Workflow

```yaml
# .github/workflows/check.yml
name: Check
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - Checkout
      - Install Rust (stable)
      - Install Node.js (≥18)
      - Install just
      - Install Tauri system deps (Linux: libwebkit2gtk, libappindicator, etc.)
      - npm install
      - just check
```

## Notes

- Linux needs system packages for Tauri (webkit2gtk, libayatana-appindicator, etc.). See [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/#linux).
- Windows and macOS runners have most deps pre-installed.
- If `just check` passes locally, it should pass in CI. If it doesn't, fix CI — don't fork the check logic.

## Steps

1. Create `.github/workflows/check.yml` with the matrix above.
2. Verify it passes on all three platforms.
3. Add branch protection rule requiring the check to pass.

## Runtime Budget Tracking (Sprint02)

- Focused simulator regression job target: `sprint01-chat-e2e` should complete within **<= 8 minutes** on `ubuntu-latest`.
- Added CI guardrail: job-level `timeout-minutes: 8` plus focused command scope (`simulator/tests/smoke.spec.ts` + `-g "Sprint01 Chat Regressions"`).
- Follow-up process:
  1. Open draft PR with workflow changes.
  2. Capture representative run URL(s) and observed duration(s) for `sprint01-chat-e2e`.
  3. Record findings here and in sprint task tracking before finalizing.

Status: **Runtime budget proven on representative PR CI run**.

### Evidence Log

- Draft PR evidence run captured:
  - PR: `https://github.com/oribarilan/flint/pull/1`
  - Workflow run: `https://github.com/oribarilan/flint/actions/runs/23320234373`
  - Job: `sprint01-chat-e2e` (`https://github.com/oribarilan/flint/actions/runs/23320234373/job/67829706752`)
  - Result: **success**, duration **49s** (`2026-03-19T22:37:35Z` → `2026-03-19T22:38:24Z`)
  - Budget check: **PASS** (`49s <= 8m`)
- Re-run after docs evidence commit:
  - Workflow run: `https://github.com/oribarilan/flint/actions/runs/23320457402`
  - Job: `sprint01-chat-e2e` (`https://github.com/oribarilan/flint/actions/runs/23320457402/job/67830391602`)
  - Result: **success**, duration **51s** (`2026-03-19T22:44:16Z` → `2026-03-19T22:45:07Z`)
  - Budget check: **PASS** (`51s <= 8m`)
- Local pre-check: focused regression command passes locally.
