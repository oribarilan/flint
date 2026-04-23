# Flint

A desktop personal work assistant powered by GitHub Copilot SDK.

> **Mission:** Stay on top of your work day — meeting alerts, calendar awareness, and an AI assistant one keystroke away.

## Features

- **Meeting alerts** — background monitoring of your Microsoft 365 calendar. Native OS notifications before meetings start.
- **On-demand overlay** — press `Option+Space` to see upcoming meetings and chat with Flint.
- **Conversational agent** — ask about your schedule, meetings, attendees. Powered by Copilot SDK + Work IQ MCP.
- **Meeting cards** — glanceable view of upcoming meetings with time-until, attendees, and one-click join.
- **System tray** — always running, unobtrusive. Badge shows upcoming meeting count.

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
just package-mac  # Package for macOS
```

## Architecture

See `docs/superpowers/specs/2026-04-23-desktop-assistant-design.md` for the full architecture spec.

```
Electron Main Process
├── CopilotManager          — SDK client lifecycle
├── SessionManager          — Chat + monitor sessions
├── MeetingMonitor          — Background polling + alerts
├── Window Manager          — Overlay, tray, hotkey
└── Config Store            — Preferences

Renderer Process (React 19)
├── MeetingCards            — Upcoming meetings
├── MeetingDetail           — Expanded meeting view
├── ChatPanel + ChatInput   — Conversational agent
└── Design Tokens           — Flint dark theme
```
