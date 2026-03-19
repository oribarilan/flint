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

### Evidence Log

- Pending: draft PR run for `sprint01-chat-e2e` (focused `simulator/tests/smoke.spec.ts -g "Sprint01 Chat Regressions"`).
- Local pre-check: focused regression command passes locally; CI duration evidence will be added from GitHub Actions run summary.
