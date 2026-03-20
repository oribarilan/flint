# Contributing to Flint

## Getting Started

```bash
git clone https://github.com/oribarilan/flint.git
cd flint
npm install
just dev    # Dev mode with hot reload
```

### Prerequisites

- **Rust** (stable) — [rustup.rs](https://rustup.rs)
- **Node.js** (18+) and npm
- **just** — task runner (`cargo install just`)
- Tauri v2 system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Development

### Commands

```bash
just              # List all available commands
just dev          # Dev mode with hot reload
just check        # Run ALL checks (lint + format + test + build)
just test         # Run all tests (Rust + frontend)
just lint         # Run all linting (Clippy + ESLint)
just format       # Check all formatting (rustfmt + Prettier)
```

### Test Paths (Baseline vs Gated)

Flint now has explicit test paths for speed vs coverage enforcement:

- `just test` — baseline non-coverage test run (Rust + frontend)
- `just test-quick` — fastest local loop (changed-frontend + regular Rust tests)
- `just test-gated` — coverage-enforced run (Rust + frontend)

Stack-specific variants:

- `just test-rust`, `just test-rust-quick`, `just test-rust-gated`
- `just test-frontend`, `just test-frontend-quick`, `just test-frontend-gated`

Coverage tooling setup:

```bash
just setup-test-tools
```

This installs `cargo-llvm-cov` (required for `test-rust-gated`).

### Simulator Modes

The browser simulator supports two explicit modes:

- `npm run sim` (**dev mode**) — uses real OpenCode HTTP/SSE proxy handlers (`/opencode/*` via Vite proxy). Use this for manual integration checks against a running OpenCode server.
- `npm run sim:test` (**test mode**) — uses deterministic mocked OpenCode handlers with mocked platform APIs. Use this for Playwright and any reproducible automation.

Playwright is configured to always run against deterministic simulator test mode (`sim:test`).

If OpenCode is unavailable in dev mode, simulator chat should remain stable and report disconnected state (no crash).

Focused local repro command for CI simulator chat regressions:

```bash
npx playwright test simulator/tests/smoke.spec.ts -g "Sprint01 Chat Regressions"
```

Runtime budget guardrail (CI): the focused simulator regression job targets **<= 8 minutes** on `ubuntu-latest`.

### macOS Keychain Prompts

On macOS, unsigned dev builds trigger repeated "Flint wants to access your keychain" prompts because the OS requires signed binaries for silent keychain access.

Flint handles this automatically: **debug builds use file-based credential storage** at `~/.flint/dev-tokens/` instead of the OS keychain. Files are created with `0600` permissions. No manual setup is needed — just run `just dev` and authentication works without prompts.

Release builds continue to use the OS keychain via the `keyring` crate.

## Running Checks

Before submitting changes, run the full check suite:

```bash
just check
```

This runs linting (Clippy + ESLint), formatting (rustfmt + Prettier), tests (Rust + frontend), and a full build.
