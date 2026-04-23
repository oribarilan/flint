# Flint — task runner

# List available commands
default:
    @just --list

# Run all checks (lint + format + test + build)
check: lint format test build

# Run all tests
test: test-frontend

# Run a fast, non-coverage local test loop
test-quick: test-frontend-quick

# Run coverage-gated test suite
test-gated: test-frontend-gated

# Run frontend tests
test-frontend:
    npm run test

# Run frontend tests quickly using changed-files filter
test-frontend-quick:
    npm run test:quick

# Run frontend tests with coverage gates
test-frontend-gated:
    npm run test:coverage

# Run all linting
lint: lint-frontend

# Run frontend linting (ESLint)
lint-frontend:
    npm run lint

# Run all formatting checks
format: format-frontend

# Check frontend formatting (Prettier)
format-frontend:
    npm run format:check

# Build everything (electron-vite)
build: build-frontend

# Build frontend + main + preload via electron-vite
build-frontend:
    npm run build

# Full Electron app build for macOS
build-app:
    npm run build:mac

# Dev mode with hot reload
dev:
    npm run dev

# Typecheck all layers
typecheck:
    npm run typecheck
