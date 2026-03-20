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

## Sprint03 Gap Snapshot (2026-03-20)

Representative failing run: `https://github.com/oribarilan/flint/actions/runs/23320457402`

- `sprint01-chat-e2e`: ✅ passing, **51s** (within <= 8m budget)
- `check (ubuntu-latest)`: ❌ fails in `lint-rust` (`clippy -D warnings`)
- `check (windows-latest)`: ❌ fails in `lint-rust` (`clippy -D warnings`)

Primary gap classes:

1. Rust lint failures (cross-platform + Windows-specific) in `commands.rs`, `icons.rs`, `focus.rs`, `kits/window_management.rs`.
2. Node 20 action deprecation warning for `actions/checkout@v4` and `actions/setup-node@v4`.

Tracked in Sprint03:

- `.todo/sprint03/1-fix-cross-platform-clippy-breakages.md`
- `.todo/sprint03/2-icons-module-lifecycle-and-usage.md`
- `.todo/sprint03/3-actions-node24-deprecation-mitigation.md`
- `.todo/sprint03/4-ci-diagnostics-and-runtime-observability.md`
