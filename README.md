# Flint

A desktop personal work assistant powered by GitHub Copilot SDK.

> **Mission:** Stay on top of your work day — deterministic meeting alerts plus an AI assistant one keystroke away.

## Features

- **Meeting alerts** — deterministic background scheduler watches your Microsoft 365 calendar and fires native OS notifications before meetings start. No LLM in the alert path.
- **On-demand overlay** — press `Option+Space` to summon Flint. Ask anything about your work day; the answer streams back.
- **Conversational agent** — chat session powered by GitHub Copilot SDK with the Work IQ MCP server. Ask about your schedule, meetings, recent mail, Teams messages.
- **Attention panel** — when you ask Flint about your day, glanceable cards appear alongside the answer. Click to open.
- **System tray** — always running, unobtrusive.

> V1 is **pull-only**: Flint speaks when you press the hotkey or when a meeting alert is due. No LLM-driven ambient nudges. See `docs/superpowers/specs/2026-04-30-v1-scope-decision.md`.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Electron 39+ |
| Build | electron-vite 5 |
| Frontend | React 19 + TypeScript |
| State | Zustand 5 |
| AI | GitHub Copilot SDK |
| M365 Data | Work IQ MCP |
| Config | electron-store |

## Prerequisites

- **Node.js** 18+
- **GitHub Copilot** — signed in via `copilot auth`
- **Microsoft 365 Copilot license** — for Work IQ access
- **Work IQ CLI** — `workiq accept-eula` (one-time setup)

## Quick Start

```bash
npm install
just dev      # Dev mode with hot reload
```

## Commands

```bash
just              # List all commands
just dev          # Dev mode with hot reload
just build        # Production build
just test         # Unit tests (Vitest)
just test-e2e     # E2E tests (Playwright + Electron)
just check        # Lint + format + typecheck + test
just eval         # Run real-Copilot evals against the chat prompt (see below)
just package-mac  # Package for macOS
```

## Prompt evals

The chat system prompt enforces several behaviors the product depends on (no markdown tables, no emojis, populate the attention panel for work items, use inline code for paths). Unit tests check the prompt _string_; the eval suite checks the model's _behavior_ under that prompt.

```bash
just eval                   # default: 3 reps per eval, gpt-4.1
EVAL_REPS=5 just eval       # more reps to dampen flakiness
EVAL_MODEL=gpt-4o just eval # try a different model
```

Each eval runs `EVAL_REPS` times and passes if at least ⌈REPS × 2/3⌉ samples pass. Results are written to `eval-results/<ISO-timestamp>.json` for tracking drift over time.

Evals require `copilot auth` on the host machine, hit the real Copilot API (cost + network), and are excluded from `just check` for that reason. Run them on demand before merging changes to `src/main/copilot/prompts/chat.md` or after a model bump.

## Architecture

See `docs/superpowers/specs/2026-04-30-v1-scope-decision.md` for the V1 scope, and `2026-04-23-desktop-assistant-design.md` for the broader architecture (partially superseded).

```
Electron Main Process
├── CopilotManager          — SDK client lifecycle
├── SessionManager          — Chat session (single)
├── MeetingScheduler        — Deterministic 60s timer for meeting alerts
├── AttentionStore          — Items populated by chat session
├── Window Manager          — Overlay, tray, hotkey
└── Config Store            — Preferences

Renderer Process (React 19)
├── AttentionPanel          — Meetings & items the chat surfaced
├── ChatPanel + ChatInput   — Streaming conversational agent
├── ConnectionDot           — Copilot connection status indicator
└── Design Tokens           — Flint themes
```
