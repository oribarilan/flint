# Contributing to Flint

## Getting Started

```bash
git clone https://github.com/oribarilan/flint.git
cd flint
npm install
just dev    # Dev mode with hot reload
```

### Prerequisites

- **Node.js** 18+ and npm
- **just** — task runner (`brew install just` or `cargo install just`)
- **GitHub Copilot CLI** — signed in (`copilot auth`)
- **Work IQ CLI** — M365 access (`workiq accept-eula`)

## Development

### Commands

```bash
just              # List all available commands
just dev          # Dev mode with hot reload (HMR for renderer, restart for main)
just check        # Run ALL checks (lint + format + typecheck + test)
just test         # Unit tests (Vitest)
just test-e2e     # E2E tests (Playwright + Electron)
just typecheck    # TypeScript type checking
just lint         # ESLint
just format       # Prettier format check
just build        # Production build
just package-mac  # Package for macOS distribution
```

### Project Structure

```
src/
├── main/                 # Electron main process
│   ├── index.ts          # App entry point
│   ├── copilot/          # Copilot SDK integration
│   ├── meetings/         # Meeting monitor, cache, notifications
│   ├── window/           # Overlay, tray, hotkey
│   ├── ipc/              # IPC handlers and channel definitions
│   ├── config.ts         # electron-store config
│   └── types.ts          # Shared types (Meeting, FlintConfig)
├── preload/
│   └── index.ts          # contextBridge IPC exposure
└── renderer/
    ├── index.html        # Renderer HTML entry
    └── src/              # React app
        ├── components/   # MeetingCards, MeetingDetail, ChatPanel, etc.
        ├── hooks/        # useChat, useMeetings
        ├── stores/       # Zustand (chatStore, meetingStore)
        ├── lib/          # IPC wrappers, markdown
        └── styles/       # Design tokens (global.css)
```

### Build Pipeline

Uses **electron-vite** to manage three build targets:

- **Main process** — compiled to CommonJS
- **Preload script** — compiled for sandboxed context
- **Renderer** — Vite + React with HMR in dev mode

Config: `electron.vite.config.ts`

### TypeScript

Two separate tsconfigs (enforced by electron-vite):

- `tsconfig.node.json` — main + preload (Node.js target)
- `tsconfig.web.json` — renderer (browser target, JSX)

Root `tsconfig.json` uses project references to both.

## Testing

### Unit Tests (Vitest)

```bash
just test
```

- Main process tests: `src/main/__tests__/`
- Renderer tests: `src/renderer/src/**/__tests__/`
- Mock Electron APIs and CopilotClient — never hit real services

### E2E Tests (Playwright + Electron)

```bash
just test-e2e
```

- Uses `_electron.launch()` for native Electron testing
- Tests: `tests/e2e/`
- Builds first, then launches the production build

## Code Style

- **TypeScript strict mode** everywhere
- **ESLint** + **Prettier** — run `just lint` and `just format`
- **CSS Modules** with design tokens from `global.css`
- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`

## Design

Visual identity spec: `specs/design.md`

All visual properties use semantic design tokens. Never hardcode colors, spacing, or font sizes in component CSS.

## Documentation

- **Architecture spec**: `docs/superpowers/specs/2026-04-23-desktop-assistant-design.md`
- **Implementation plan**: `docs/superpowers/plans/2026-04-23-desktop-assistant-plan.md`
- **Design spec**: `specs/design.md`
- **Agent instructions**: `AGENTS.md`
