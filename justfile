# Flint — Desktop Personal Assistant

default:
    @just --list

# Dev mode with hot reload
dev:
    npm run dev

# Build everything (electron-vite)
build:
    npm run build

# Run all unit tests
test: test-unit

# Run unit tests (Vitest)
test-unit:
    npx vitest run

# Run E2E tests (Playwright + Electron)
test-e2e:
    npm run test:e2e

# Typecheck all layers
typecheck:
    npm run typecheck

# Run linting (ESLint)
lint:
    npx eslint 'src/**/*.{ts,tsx}'

# Check formatting (Prettier)
format:
    npx prettier --check 'src/**/*.{ts,tsx,css}'

# Run all checks (lint + format + typecheck + test)
check: lint format typecheck test

# Full Electron app build for macOS
package-mac:
    npm run build:mac
