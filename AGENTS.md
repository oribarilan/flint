# Flint — Agent Instructions

## Project Overview

Flint is an AI-native application launcher built with Tauri v2. It provides a global hotkey-activated overlay for file search and an AI agent mode, powered by an OpenCode backend connected to the user's "second brain" (a local GitHub repo of plain markdown files).

## Specs & Planning

- **`spec.md`** — UX specification (modes, settings, interactions). This is the source of truth for product behavior. Always follow it. If an implementation decision conflicts with the spec, raise it rather than silently diverging.
- **`specs/design.md`** — Visual identity, design tokens, and UI principles. This is the source of truth for how Flint looks and feels. All frontend CSS and component structure must follow it. Covers: identity (Spark × Strike), typography, color system, spacing, icons, interaction states, motion, accessibility, and empty states.
- **`plan.md`** — Implementation roadmap and phasing.
- **`gaps.md`** — Known cross-platform and feature gaps.
- **`.todo/`** — Standalone tasks with full context for future sessions. See [Task Management](#task-management) below.

When proposing changes that would alter the spec or design spec (new modes, different interaction patterns, visual identity changes, etc.), flag them for review rather than updating the specs directly.

## Task Management

Work items live in `.todo/` as self-contained Markdown files. Each file carries enough context for a fresh session to pick it up and execute without external knowledge.

### Directory Structure

| Directory | Purpose | Contents |
|-----------|---------|----------|
| `.todo/` | **Ready to implement** — clear tasks with defined scope | Requirements, implementation steps, file changes |
| `.todo/explore/` | **Needs research** — ideas that need investigation before committing | Options, trade-offs, platform considerations, phased breakdown |
| `.todo/done/` | **Historical record** — completed tasks preserved for future reference | Decisions made, rationale, architecture chosen |

### Lifecycle

```
explore/  ──(promote)──▶  .todo/  ──(finalize)──▶  done/
                            ▲
               (clear tasks go directly here)
```

- **Clear tasks** go directly to `.todo/` root — no exploration needed.
- **Exploratory items** start in `explore/`. When research is complete, update the file with findings and decisions, then promote it to `.todo/` root.
- **Completed tasks** move to `done/` via `git mv` when the user says to finalize. The `done/` directory serves as a decision log — future sessions can reference it for rationale and context.

### File Format

Every `.todo/` file follows this structure:

1. **`# Title`** — Feature or task name.
2. **`## Summary`** — 2–4 sentences: what and why.
3. **`## Requirements`** or **`## Decisions`** — Scope, constraints, decision tables.
4. **`## Implementation`** — Architecture, code sketches, numbered steps.
5. (Optional) **`## Notes`**, **`## Risks`**, **`## Out of Scope`** — Caveats and boundaries.

Explore files tend to be longer with more options and trade-off analysis. Root files are focused and imperative.

### Rules for Agents

- **Only work on a `.todo/` item when the user explicitly asks.** Do not proactively pick up tasks.
- **Do not move files to `done/` until the user says to finalize.** The user decides when a task is truly complete.
- **Either the user or the agent can create new `.todo/` files.** When an agent identifies follow-up work during a task, it can create a new `.todo/` file for it.
- **Treat `.todo/` files as the task spec.** Read the file thoroughly before starting. If the file conflicts with `spec.md` or `specs/design.md`, raise it.

## Engineering Principles

These are non-negotiable. When any of these are at risk, raise a red flag.

1. **Single Responsibility.** Every class, struct, function, file, and module has one job. Files should stay under 500 LOC. When something grows beyond its scope, split it.
2. **DRY.** One source of truth. Don't duplicate logic, constants, types, or configuration. Extract shared code early.
3. **KISS.** Both implementation and UX must be simple and elegant. Prefer the straightforward solution. Complexity must justify itself.
4. **Clean Code.** Readable, intention-revealing names. No dead code, no commented-out code. Small functions. Code should explain itself; comments explain *why*, not *what*.
5. **Performance.** This is an app launcher — it must feel instant. Never block the main thread. Be allocation-aware in hot paths. Defer non-critical work. Virtualize long lists. Debounce expensive operations. Every feature should be evaluated for its performance impact.
6. **Security.** Minimize attack surface. Apply least-privilege to Tauri capabilities, CSP, OAuth scopes, and IPC data boundaries. Sanitize and validate all inputs — especially file paths and IPC parameters. Never log secrets or PII. Treat dependencies as attack surface: audit, minimize, prefer well-maintained libraries.
7. **Accessibility.** This is a keyboard-driven app. Focus management, ARIA roles, and semantic HTML are required. Screen reader support is a goal, not an afterthought.
8. **Observability.** Use structured logging. Errors should be traceable. Define clear log levels and never log sensitive data.
9. **Error Resilience.** Handle failures gracefully at every layer. Rust: `Result`/`Option` everywhere. Frontend: error boundaries for each major UI section, user-friendly messages for IPC failures, no white screens or raw stack traces.
10. **Unit Tests.** Every module ships with isolated unit tests. Coverage should be very high — all public functions, positive + negative cases, edge cases. Tests are not optional.
11. **TDD When Debugging.** When an issue surfaces, write a failing test first if feasible, then fix and see it go green. Regression tests are mandatory for bugs.

**Challenge and suggest.** When implementing any feature, if there is an alternative approach that is more performant, more secure, simpler, or more accessible — raise it. Don't silently pick a suboptimal path. Present the tradeoff and let the decision be made explicitly.

### Performance-Critical Paths

Two code paths are **sacred** and must remain as close to zero-overhead as possible:

1. **Overlay ready path** — everything that runs when Flint's overlay becomes visible (hotkey pressed → window shown → input focused and responsive). This must feel instantaneous. No network calls, no heavy computation, no disk I/O on this path.
2. **Result processing path** — from the moment search results or AI responses are received to the moment they are rendered and interactive. Parsing, filtering, sorting, and rendering results must never introduce perceptible lag.

**Enforcement rule:** If any ask, spec change, or new requirement would add work to either of these paths — warn the user, quantify the impact if possible, and challenge whether it truly belongs there. Suggest deferring, batching, or moving the work off the critical path. Do not silently accept changes that degrade these paths.

## Architecture

- **Rust backend** (`src-tauri/`): Spotlight search (macOS), fuzzy matching (nucleo), Copilot auth + chat API, window management, hotkey registration.
- **React frontend** (`src/`): Search bar, results list, AI chat panel. State via Zustand. Bundled with Vite.
- **IPC bridge**: All I/O and business logic lives in Rust. Frontend calls Rust via `tauri::command` invoke. Never use Node.js APIs for I/O.

### Config & State Consistency

The app has two layers of state: the **config file** (TOML on disk, source of truth for user preferences) and **in-memory runtime state** (registry, stores). These can diverge. Rules:

- **Backend-reported state is authoritative for the frontend.** When the Settings UI needs to display a value (e.g., whether a kit is enabled), use the backend API response — not config values with fallback defaults. Config fallbacks like `config.kits[id]?.enabled ?? true` will silently produce wrong answers when the backend has a different default.
- **Features that are disabled by default must still be visible in Settings.** Register all entities (kits, commands) in the registry regardless of enabled state. Track enabled/disabled as a flag, don't drop disabled entities from the registry entirely — that makes them invisible and untoggleable.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript (strict) + Vite |
| State | Zustand |
| AI | GitHub Copilot (OAuth Device Flow, shared client ID) |
| Fuzzy search | `nucleo` crate |
| File search | macOS Spotlight (`mdfind`) |
| HTTP | `reqwest` + `tokio` |
| Secrets | `keyring` crate (OS keychain) |
| Serialization | `serde` + `serde_json` |

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

## Design System

See **`specs/design.md`** for the full design specification including visual identity, token definitions, typography, color system, interaction states, and motion.

All visual properties must use **semantic design tokens** defined in `src/styles/global.css`. Never hardcode colors, spacing, font sizes, shadows, or radii in component CSS files.

### Key Rules

- **No hardcoded hex/rgba in component CSS.** Use semantic token variables.
- **No hardcoded px for spacing.** Use `var(--space-*)`. Exception: border widths (1px, 2px, 3px).
- **No hardcoded px for font sizes.** Use `var(--font-*)`. All sizes in `rem`.
- **All interactive elements need full state coverage** — default, hover, focus-visible, active, selected, disabled, loading.
- **Theming**: Component CSS references only semantic tokens. Swapping themes changes `global.css` / `themes.css` — component files stay untouched.
- **No CSS transitions on keyboard-driven selection states.** Transitions cause cross-fade jitter when arrow keys move selection between items (old fading out + new fading in = smearing). Selection changes must be instant. Transitions are only appropriate for mouse hover, which is continuous.
- **`prefers-reduced-motion` must be respected.** See motion section in design spec.
- **Scrollable containers must set `overscroll-behavior: contain`.** Without this, macOS elastic rubber-banding propagates to the parent, causing a non-linear bouncy feel — especially noticeable when result lists first become scrollable (e.g., clipboard history returning 20+ items on empty query).
- **Animated UI elements (highlights, selection indicators) must handle empty state.** When a list empties (results cleared, command deactivated), any absolutely-positioned highlight or indicator must be explicitly hidden. Stale position/dimensions from the previous state cause ghost artifacts.

## Tauri v2 Patterns

- Every Rust-side capability is a `#[tauri::command]` function. Each command gets a matching TypeScript wrapper in `src/lib/commands.ts`.
- Validate all IPC parameters on the Rust side before processing.
- Use Tauri's plugin system (`tauri-plugin-global-shortcut`, `tauri-plugin-shell`, etc.) instead of reimplementing OS integrations.
- Window configuration (borderless, always-on-top, transparent) is defined in `tauri.conf.json`, not programmatically unless dynamic behavior is needed.
- Tokens and secrets go in the OS keychain via `keyring`. Never in localStorage, files, or frontend state.
- **Dynamic windows must avoid flash-of-white.** When creating windows programmatically via `WebviewWindowBuilder`, always: (1) set `.visible(false)` so the window starts hidden, (2) set `.background_color()` matching the app's dark theme so the native surface is never white, and (3) call `getCurrentWindow().show()` from a React `useEffect` that fires only after async data (config, theme) has loaded **and** the component has rendered. Never show from `main.tsx` — the webview may not have painted yet.
- **Hiding the window must produce a clean slate.** Any action that hides the overlay (Copy, Open, etc.) must reset transient UI state — deactivate command chips, clear action panels, hide selection highlights. When the user re-invokes Flint, they must see a fresh search bar, not a stale mid-workflow state.
- **Lazy init vs. eager init.** Kits are initialized lazily on first use (e.g., when a prefix matches). Kits that run background tasks (clipboard watcher, stock ticker) must declare `eager_init() → true` so their `init()` runs at startup — a prefix-less kit will otherwise never be initialized because no user action triggers it.

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

### E2E Smoke Tests via Simulator
- **Tool**: Playwright + a web simulator that runs the full Flint UI in a browser with Tauri APIs mocked.
- **Simulator**: `simulator/` directory — patches `window.__TAURI_INTERNALS__` to intercept all IPC calls. Run via `just sim` (port 3000).
- **Mock layer**: `simulator/mock-tauri.ts` provides mock search results, streaming chat responses, model data, provider auth, and tool call simulation.
- **Tests**: `simulator/tests/` — Playwright specs. Run via `just test-e2e`.
- **Playwright MCP**: When available, use the Playwright MCP tools (`playwright-browser_navigate`, `playwright-browser_snapshot`, `playwright-browser_click`, etc.) to interactively verify UI changes in the simulator. Always spin up the simulator and visually confirm implementations.
- **Rule**: Every UI feature or change must include Playwright E2E tests against the simulator. Spin up the simulator to verify both functionality and visual design before considering work complete.
- **Global control**: `window.__sim` exposes `emit()`, `state`, `setConnected()`, `setRepoPath()` for programmatic test control.

## Security

See also: **Security** principle in Engineering Principles above.

- Auth credentials managed by OpenCode (stored in `~/.local/share/opencode/auth.json`).
- All user input validated at the Rust IPC boundary.
- File paths from the frontend must be canonicalized and checked against allowed directories before access.
- No secrets in source code. Use environment variables for dev-only config.
- Dependencies audited via `cargo audit` and `npm audit` in CI.
- Tauri capabilities (`src-tauri/capabilities/`) follow least-privilege — only grant permissions each window actually needs.
- CSP defined in `tauri.conf.json` — no `unsafe-inline`, no `unsafe-eval`, restrict `connect-src` to known domains.

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Small, focused commits. One logical change per commit.
- **Never commit or push without explicit user approval.** Present the changes and wait for confirmation before running `git commit` or `git push`.
