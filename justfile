# Flint — task runner

# List available commands
default:
    @just --list

# Run all checks (lint + format + test + build)
check: lint format test build

# Run all tests
test: test-rust test-frontend

# Run a fast, non-coverage local test loop (best-effort)
test-quick: test-rust-quick test-frontend-quick

# Run coverage-gated test suites (Rust + frontend)
test-gated: test-rust-gated test-frontend-gated

# Run Rust tests
test-rust:
    cargo test --manifest-path src-tauri/Cargo.toml --all-features

# Run Rust tests quickly (same behavior as test-rust for now)
test-rust-quick:
    cargo test --manifest-path src-tauri/Cargo.toml --all-features

# Run Rust tests with coverage gates
test-rust-gated:
    cargo llvm-cov --manifest-path src-tauri/Cargo.toml --all-features --workspace --fail-under-lines 35 --summary-only

# Run frontend tests
test-frontend:
    npm run test

# Run frontend tests quickly using changed-files filter
test-frontend-quick:
    npm run test:quick

# Run frontend tests with coverage gates
test-frontend-gated:
    npm run test:coverage

# Install optional local tooling used by gated paths
setup-test-tools:
    cargo install cargo-llvm-cov

# Run all linting
lint: lint-rust lint-frontend

# Run Rust linting (Clippy)
lint-rust:
    cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings

# Run frontend linting (ESLint)
lint-frontend:
    npm run lint

# Run all formatting checks
format: format-rust format-frontend

# Check Rust formatting
format-rust:
    cargo fmt --manifest-path src-tauri/Cargo.toml --check

# Check frontend formatting (Prettier)
format-frontend:
    npm run format:check

# Build everything
build: build-frontend build-rust

# Build frontend (TypeScript + Vite)
build-frontend:
    npm run build

# Build Rust backend
build-rust:
    cargo build --manifest-path src-tauri/Cargo.toml

# Full Tauri app build
build-app:
    npm run tauri build

# Dev mode with hot reload
dev:
    npm run tauri dev

# Run UI simulator in browser (no Tauri needed)
sim:
    npm run sim

# Run E2E tests against the simulator
test-e2e:
    npm run test:e2e
