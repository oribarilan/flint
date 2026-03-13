# Flint — Agent Instructions

## Project Overview

Flint is an AI-native application launcher built with Tauri v2. It provides a global hotkey-activated overlay for file search and AI chat, powered by a GitHub Copilot subscription via OAuth Device Flow.

## Specs & Planning

- **`spec.md`** — UX specification (modes, settings, interactions). This is the source of truth for product behavior. Always follow it. If an implementation decision conflicts with the spec, raise it rather than silently diverging.
- **`plan.md`** — Implementation roadmap and phasing.
- **`gaps.md`** — Known cross-platform and feature gaps.
- **`.todo/`** — Standalone tasks with full context for future sessions.

When proposing changes that would alter the spec (new modes, different interaction patterns, etc.), flag them for review rather than updating the spec directly.

## Engineering Principles

These are non-negotiable. When any of these are at risk, raise a red flag.

1. **Single Responsibility.** Every class, struct, function, file, and module has one job. Files should stay under 500 LOC. When something grows beyond its scope, split it.
2. **DRY.** One source of truth. Don't duplicate logic, constants, types, or configuration. Extract shared code early.
3. **KISS.** Both implementation and UX must be simple and elegant. Prefer the straightforward solution. Complexity must justify itself.
4. **Clean Code.** Readable, intention-revealing names. No dead code, no commented-out code. Small functions. Code should explain itself; comments explain *why*, not *what*.
5. **Unit Tests.** Every module ships with isolated unit tests. Coverage should be very high — all public functions, positive + negative cases, edge cases. Tests are not optional.
6. **TDD When Debugging.** When an issue surfaces, write a failing test first if feasible, then fix and see it go green. Regression tests are mandatory for bugs.

## Architecture

- **Rust backend** (`src-tauri/`): File indexing, fuzzy search (nucleo), Copilot auth + chat API, window management, hotkey registration.
- **React frontend** (`src/`): Search bar, results list, AI chat panel. State via Zustand. Bundled with Vite.
- **IPC bridge**: All I/O and business logic lives in Rust. Frontend calls Rust via `tauri::command` invoke. Never use Node.js APIs for I/O.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript (strict) + Vite |
| State | Zustand |
| AI | GitHub Copilot (OAuth Device Flow, shared client ID) |
| Fuzzy search | `nucleo` crate |
| HTTP | `reqwest` + `tokio` |
| Secrets | `keyring` crate (OS keychain) |
| Serialization | `serde` + `serde_json` |
| FS events | `notify` crate (cross-platform) |

## Commands

This project uses a `justfile` for common tasks. Run `just` to list all available recipes.

```bash
just                    # List all available commands
just dev                # Dev mode with hot reload
just check              # Run ALL checks (lint + format + test + build)
just test               # Run all tests (Rust + frontend)
just lint               # Run all linting (Clippy + ESLint)
just format             # Check all formatting (rustfmt + Prettier)
just build              # Build everything (frontend + Rust)
just build-app          # Full Tauri app bundle
```

Individual targets are also available (`just test-rust`, `just lint-frontend`, etc.).

## Rust Conventions

- **Error handling**: Use `Result`/`Option` everywhere. `thiserror` for library-style errors, `anyhow` only in top-level command handlers. Never `unwrap()`/`expect()` in production code.
- **Naming**: `snake_case` for modules, functions, variables. Types are `PascalCase`.
- **Structure**: One responsibility per module. Keep functions under 50 lines. Split early.
- **Immutability**: Prefer `let` over `let mut`. Clone only when borrowing is not feasible.
- **Iteration**: Prefer iterators and combinators over manual loops. Don't `.collect()` too early.
- **Documentation**: `///` doc comments on all public items. `//!` for module-level docs.
- **Linting**: Code must pass `cargo clippy -- -D warnings` and `cargo fmt --check`.
- **Unsafe**: Never use `unsafe` unless there is a clear, documented justification.
- **Dependencies**: Pin major versions in `Cargo.toml`. Audit new crates before adding.

## TypeScript / React Conventions

- **Components**: Functional only. PascalCase filenames and component names.
- **Types**: Strict mode enabled. Explicit interfaces/types for props, state, and API responses. No `any`.
- **Hooks**: Extract reusable logic into custom hooks (`useSearch`, `useAuth`, `useCopilotChat`). Prefix with `use`.
- **State**: Local state by default. Zustand for cross-cutting concerns only.
- **Naming**: `camelCase` functions/variables, `PascalCase` components/types, `UPPER_SNAKE` constants.
- **Styling**: CSS Modules. No global styles in component files.
- **Imports**: Use Vite path aliases. No `require()`. Environment via `import.meta.env`.

## Tauri v2 Patterns

- Every Rust-side capability is a `#[tauri::command]` function. Each command gets a matching TypeScript wrapper in `src/lib/commands.ts`.
- Validate all IPC parameters on the Rust side before processing.
- Use Tauri's plugin system (`tauri-plugin-global-shortcut`, `tauri-plugin-shell`, etc.) instead of reimplementing OS integrations.
- Window configuration (borderless, always-on-top, transparent) is defined in `tauri.conf.json`, not programmatically unless dynamic behavior is needed.
- Tokens and secrets go in the OS keychain via `keyring`. Never in localStorage, files, or frontend state.

## Cross-Platform

This app targets macOS, Windows, and Linux. All platform-specific code must use `#[cfg]` attributes (not `cfg!()` macro) with imports scoped inside conditional blocks. Prefer `unix`/`windows` families over specific OS names when possible. Isolate platform code into `mod platform` submodules with a shared interface. See `.claude/skills/crossplatform/` for detailed patterns.

## Testing

Three layers, each serving a different purpose:

### Unit Tests
- **Rust**: `#[cfg(test)] mod tests` in each source file. Cover all public functions with positive + negative + edge cases. Run via `just test-rust`.
- **Frontend**: Vitest + React Testing Library. At least one test per component/hook. `describe`/`it` structure. Run via `just test-frontend`.
- **Naming**: Descriptive — `should_return_empty_when_query_is_blank`, not `test1`.
- **Mocking**: Mock Tauri IPC calls in frontend tests. Mock filesystem/network in Rust tests.

### Integration Tests
- **Rust**: `src-tauri/tests/` directory. Test multi-module flows: indexer → search pipeline, config file round-trip, SSE stream parsing end-to-end.
- **Frontend**: Test component interactions: mode switching, Escape layering, store lifecycle. Mock the IPC boundary but test the full React tree.

### E2E Smoke Tests
- **Tool**: `tauri-driver` (WebDriver-compatible) for automated app launch + interaction.
- **Scope**: A small set of critical-path tests — app launches, search returns results, settings window opens. Not comprehensive UI testing.
- **Run**: `just test-e2e`. Intended for CI and pre-release validation.
- **Location**: `tests/e2e/`.

## Security

- Minimal OAuth scope: `read:user` only.
- Tokens stored exclusively in OS keychain. Never logged, never sent to frontend state.
- All user input validated at the Rust IPC boundary.
- No secrets in source code. Use environment variables for dev-only config.
- Dependencies audited via `cargo audit` and `npm audit`.

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Small, focused commits. One logical change per commit.
- **Never commit or push without explicit user approval.** Present the changes and wait for confirmation before running `git commit` or `git push`.
