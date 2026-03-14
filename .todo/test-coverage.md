# Test Coverage Enforcement

## Summary

Wire `just test` to enforce 90% test coverage on both Rust backend and TypeScript frontend. Tests fail if coverage drops below the threshold. Add fast `test-quick` recipes for development iteration without coverage overhead.

## Requirements

- `just test` runs coverage-instrumented tests for both stacks.
- Both stacks enforce 90% line coverage (frontend also enforces functions/branches/statements).
- Tests exit non-zero if coverage is below threshold.
- Developers can still run fast tests without coverage via `just test-quick`.
- A `just setup` recipe installs required tooling.

## Rust Coverage

- **Tool**: `cargo-llvm-cov` — uses LLVM's built-in instrumentation. Works on macOS, Windows, and Linux (unlike `cargo-tarpaulin` which has poor macOS support).
- **Install**: `cargo install cargo-llvm-cov` + `rustup component add llvm-tools`.
- **Threshold**: `--fail-under-lines 90` flag exits non-zero if line coverage < 90%.
- **Exclusions**: `main.rs` (thin Tauri bootstrap, not unit-testable).

## Frontend Coverage

- **Tool**: `@vitest/coverage-v8` — V8's built-in coverage engine, standard for Vitest.
- **Install**: `npm install -D @vitest/coverage-v8`.
- **Config**: Add `coverage` block to `vite.config.ts` test section:
  - `provider: 'v8'`
  - `thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 }`
  - `include: ['src/**/*.{ts,tsx}']`
  - `exclude: ['src/test-setup.ts', 'src/**/__tests__/**', 'src/**/*.test.*', 'src/vite-env.d.ts']`
- **Script**: `package.json` `test` script becomes `vitest run --coverage`.

## File Changes

| File | Change |
|------|--------|
| `justfile` | Rewrite `test-rust`/`test-frontend` to use coverage tools. Add `test-quick`, `test-rust-quick`, `test-frontend-quick`, and `setup` recipes. |
| `vite.config.ts` | Add `coverage` config to `test` section with 90% thresholds. |
| `package.json` | Update `test` script to `vitest run --coverage`. Add `test:quick` as `vitest run`. |

No changes to `Cargo.toml` — `cargo-llvm-cov` is a cargo subcommand, not a crate dependency.

## Justfile Recipes (After)

```just
# Run all tests with coverage enforcement
test: test-rust test-frontend

# Run Rust tests with 90% coverage gate
test-rust:
    cargo llvm-cov --manifest-path src-tauri/Cargo.toml --all-features --fail-under-lines 90

# Run frontend tests with 90% coverage gate
test-frontend:
    npm run test

# Run all tests without coverage (fast, for development)
test-quick: test-rust-quick test-frontend-quick

# Run Rust tests without coverage
test-rust-quick:
    cargo test --manifest-path src-tauri/Cargo.toml --all-features

# Run frontend tests without coverage
test-frontend-quick:
    npm run test:quick

# Install development tooling
setup:
    rustup component add llvm-tools
    cargo install cargo-llvm-cov
    npm install
```

## Prerequisites

Developers run `just setup` once to install `cargo-llvm-cov` and `llvm-tools`. The `setup` recipe handles this.

## Verification

1. Run `just test-rust` — confirm it prints coverage report and enforces 90%.
2. Run `just test-frontend` — confirm it prints coverage report and enforces 90%.
3. Run `just test` — confirm both pass.
4. If current tests don't meet 90%, either add tests or temporarily lower the threshold with a tracking issue.

## Steps

1. Install `@vitest/coverage-v8` via npm.
2. Add coverage config to `vite.config.ts`.
3. Update `package.json` test scripts.
4. Rewrite `justfile` test recipes.
5. Run `just test-rust` and verify.
6. Run `just test-frontend` and verify.
7. Fix coverage gaps if needed.
