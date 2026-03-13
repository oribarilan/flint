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
