# Flint — Agent Instructions

## Project Overview

Flint is a desktop personal work assistant built with Electron. It monitors your Microsoft 365 calendar via Work IQ MCP, alerts you to upcoming meetings via native OS notifications, and provides a conversational AI overlay (hotkey-activated) powered by GitHub Copilot SDK.

## Specs & Planning

- **`docs/superpowers/specs/2026-04-23-desktop-assistant-design.md`** — Architecture spec (source of truth for system design, data flow, IPC contract).
- **`specs/design.md`** — Visual identity, design tokens, and UI principles.
- **`docs/superpowers/plans/2026-04-23-desktop-assistant-plan.md`** — Implementation plan (17 tasks, completed).
- **`.todo/`** — Standalone tasks with full context for future sessions.
- **`CONTRIBUTE.md`** — Setup instructions, prerequisites, and development workflow.

When proposing changes that would alter the spec or design spec, flag them for review rather than updating the specs directly.

## Task Management

Work items live in `.todo/` using the **tasks skill** structure. Use the `tasks` skill when creating, picking, or completing tasks.

- **Backlog tasks**: `.todo/backlog/<task-name>.md` — standalone work items
- **User stories**: `.todo/US-<story-name>/` — grouped related tasks with a `main.md` for overview and prioritization
- **Done**: `.todo/done/` — completed tasks, mirroring source structure

Every task must have a testable definition of done. Every task must deliver value on its own. See the tasks skill for templates and workflow.

## Engineering Principles

These are non-negotiable. When any of these are at risk, raise a red flag.

1. **Single Responsibility.** Every function, file, and module has one job. Files should stay under 500 LOC.
2. **DRY.** One source of truth. Don't duplicate logic, constants, types, or configuration.
3. **KISS.** Both implementation and UX must be simple and elegant. Complexity must justify itself.
4. **Clean Code.** Readable, intention-revealing names. No dead code. Small functions. Code explains itself; comments explain _why_.
5. **Performance.** The overlay must feel instant. Never block the main thread. Meeting cards come from cache (no network on show). Debounce expensive operations.
6. **Security.** Minimize attack surface. The Copilot SDK defaults to `--allow-all` tools — Flint must restrict to custom tools + Work IQ MCP only. Never log secrets or PII. Sanitize IPC inputs.
7. **Accessibility.** Keyboard-driven app. Focus management, ARIA roles, semantic HTML required.
8. **Observability.** Use structured logging (`console.log` with prefixes like `[copilot]`, `[monitor]`, `[ipc]`). Errors must be traceable.
9. **Error Resilience.** Handle failures gracefully at every layer. Frontend: error boundaries, user-friendly messages. Main process: stale cache fallback, retry with backoff. No white screens.
10. **Unit Tests.** Every module ships with isolated unit tests. Coverage should be very high.
11. **TDD When Debugging.** Write a failing test first, then fix. Regression tests are mandatory.

### Performance-Critical Paths

Two code paths are **sacred** and must remain zero-overhead:

1. **Overlay ready path** — hotkey pressed → window shown → meeting cards rendered from cache → input focused. No network calls, no Copilot queries, no disk I/O.
2. **Streaming response path** — from `assistant.message_delta` event to rendered text in the chat panel. Must be immediate.

If any change would add work to either path — warn, challenge, and suggest deferring to off-path.

## Architecture

```
Electron Main Process
├── CopilotManager          — @github/copilot-sdk client lifecycle
├── SessionManager          — Two sessions: chat (flint-main) + monitor (flint-monitor)
├── MeetingMonitor          — Background polling (15min) + alert ticks (60s)
│   ├── MeetingCache        — In-memory meeting data with alert tracking
│   └── Notifications       — Native OS notifications via Electron API
├── Window Manager          — Overlay (frameless, always-on-top), tray, global hotkey
├── Config Store            — electron-store (JSON, with migrations)
└── IPC Handlers            — Typed channels bridging main ↔ renderer

Renderer Process (React 19 + Zustand)
├── App                     — View routing (meeting list ↔ meeting detail)
├── MeetingCards            — Upcoming meetings with imminent highlighting
├── MeetingDetail           — Expanded meeting view with join button
├── ChatPanel + ChatInput   — Streaming conversational agent
├── meetingStore            — Zustand store for meetings
├── chatStore               — Zustand store for chat with streaming
└── Design Tokens           — CSS custom properties (global.css)
```

### IPC Contract

All renderer ↔ main communication goes through `window.flint` (defined in `src/preload/index.ts`).

| Channel | Direction | Payload |
|---------|-----------|---------|
| `chat:send` | renderer → main | `string` (prompt) |
| `chat:delta` | main → renderer | `string` (streaming content) |
| `chat:done` | main → renderer | — |
| `meetings:update` | main → renderer | `Meeting[]` |
| `meetings:get` | renderer → main | `→ Meeting[]` |
| `meeting:join` | renderer → main | `string` (joinUrl) |
| `config:get` | renderer → main | `→ FlintConfig` |
| `config:set` | renderer → main | `Partial<FlintConfig>` |
| `overlay:hide` | renderer → main | — |
| `connection:status` | main → renderer | `ConnectionStatus` |

No other IPC channels are exposed. The renderer has no direct access to `ipcRenderer`.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Electron 39+ |
| Build | electron-vite 5 |
| Frontend | React 19 + TypeScript (strict) |
| State | Zustand 5 |
| AI | GitHub Copilot SDK (`@github/copilot-sdk`) |
| M365 Data | Work IQ MCP (`@microsoft/workiq`) |
| Config | electron-store |
| Tests | Vitest + Playwright |

## Copilot SDK Reference

### Cookbook

The **[Copilot SDK Node.js Cookbook](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/README.md)** contains practical recipes. Refer to these when implementing SDK features:

- **[Error Handling](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/error-handling.md)** — Connection failures, timeouts, abort, graceful shutdown, `client.forceStop()`.
- **[Multiple Sessions](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/multiple-sessions.md)** — Independent sessions, custom session IDs, `client.listSessions()`, `client.deleteSession()`.
- **[Persisting Sessions](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/persisting-sessions.md)** — `client.resumeSession()`, `session.getMessages()`, session cleanup.
- **[Managing Local Files](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/managing-local-files.md)** — AI-powered file organization.
- **[PR Visualization](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/pr-visualization.md)** — GitHub MCP Server integration.

### Key Patterns

**Client lifecycle:**
```typescript
import { CopilotClient, approveAll } from "@github/copilot-sdk";
const client = new CopilotClient();
await client.start();
// ... use client ...
const errors = await client.stop(); // returns Error[] for cleanup issues
```

**Session creation with MCP:**
```typescript
const session = await client.createSession({
  sessionId: "flint-monitor",
  model: "gpt-4.1",
  onPermissionRequest: approveAll,
  mcpServers: {
    "work-iq": {
      type: "local",
      command: "npx",
      args: ["-y", "@microsoft/workiq", "mcp"],
      tools: ["*"],
    },
  },
  tools: [myCustomTool],
});
```

**Streaming:**
```typescript
session.on("assistant.message_delta", (event) => {
  process.stdout.write(event.data.deltaContent);
});
```

**Session persistence:**
```typescript
// Resume across restarts
const session = await client.resumeSession("flint-main", { onPermissionRequest: approveAll });
```

**Timeouts and abort:**
```typescript
const response = await session.sendAndWait({ prompt: "..." }, 30000); // 30s timeout
await session.abort(); // cancel in-progress request
```

**Graceful shutdown with force-stop fallback:**
```typescript
const stopPromise = client.stop();
const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
try {
  await Promise.race([stopPromise, timeout]);
} catch {
  await client.forceStop();
}
```

### SDK Documentation

- **[Official SDK Docs](https://github.com/github/copilot-sdk/blob/main/docs/index.md)** — Getting started, setup, features, troubleshooting.
- **[MCP Integration](https://github.com/github/copilot-sdk/blob/main/docs/features/mcp.md)** — Local (stdio) and remote (HTTP) MCP server configuration.
- **[Bundled CLI for Desktop Apps](https://docs.github.com/en/copilot/how-tos/copilot-sdk/set-up-copilot-sdk/bundled-cli)** — Electron/Tauri distribution pattern.
- **[Streaming Events](https://github.com/github/copilot-sdk/blob/main/docs/features/streaming-events.md)** — Real-time event reference.
- **[Custom Agents](https://github.com/github/copilot-sdk/blob/main/docs/features/custom-agents.md)** — Specialized sub-agents.
- **[Hooks](https://github.com/github/copilot-sdk/blob/main/docs/features/hooks.md)** — Intercept and customize session behavior.

### Work IQ MCP Reference

- **[Work IQ Repository](https://github.com/microsoft/work-iq)** — Official Microsoft Work IQ plugin collection. MCP servers, skills, and tools for M365 data (calendar, mail, Teams, documents, people).
- **[Work IQ CLI Docs](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/workiq-overview)** — CLI and MCP server usage, `workiq ask`, `workiq mcp`.
- **[Work IQ Plugins](https://github.com/microsoft/work-iq/blob/main/PLUGINS.md)** — Available plugins: `workiq`, `workiq-productivity`, `microsoft-365-agents-toolkit`.

## Commands

```bash
just                    # List all available commands
just dev                # Dev mode with hot reload
just check              # Run ALL checks (lint + format + typecheck + test)
just test               # Run unit tests (Vitest)
just test-e2e           # Run E2E tests (Playwright + Electron)
just typecheck          # TypeScript type checking
just lint               # ESLint
just format             # Prettier check
just build              # Production build
just package-mac        # Package for macOS distribution
```

## TypeScript Conventions

### Main Process (`src/main/`)

- **Modules**: Factory functions returning interfaces (`createCopilotManager()`, `createMeetingCache()`). No classes.
- **Error handling**: try/catch with structured logging. Never crash the main process — always fallback gracefully.
- **IPC**: All handlers registered in `src/main/ipc/handlers.ts`. Use `IPC_CHANNELS` constants, never raw strings.
- **Electron APIs**: Import only what's needed. Use `@electron-toolkit/utils` for `is.dev` checks and platform helpers.

### Renderer (`src/renderer/src/`)

- **Components**: Functional only. PascalCase filenames and component names.
- **Types**: Strict mode. Explicit interfaces for props. No `any`.
- **Hooks**: Extract reusable logic into custom hooks. Prefix with `use`.
- **State**: Local state by default. Zustand for cross-cutting concerns only.
- **Styling**: CSS Modules using design tokens from `global.css`. No hardcoded colors/spacing.
- **IPC access**: Always through `window.flint` API. Never import `ipcRenderer` directly.

## Design System

See **`specs/design.md`** for the full visual specification.

All visual properties must use **semantic design tokens** from `src/renderer/src/styles/global.css`. Never hardcode colors, spacing, font sizes, shadows, or radii in component CSS.

Key rules:
- No hardcoded hex/rgba in component CSS.
- No CSS transitions on keyboard-driven selection states.
- `prefers-reduced-motion` must be respected.
- Scrollable containers must set `overscroll-behavior: contain`.

## Testing

- **Unit (Vitest):** `src/main/__tests__/` and `src/renderer/src/**/__tests__/`. Mock Electron APIs and CopilotClient. Run via `just test`.
- **E2E (Playwright + Electron):** `tests/e2e/`. Uses `_electron.launch()`. Mock CopilotClient via env flag. Run via `just test-e2e`.
- **Naming**: Descriptive — `returns empty array when cache has no meetings`, not `test1`.

## Security

- Copilot SDK tool scoping: disable all built-in tools, expose only custom tools + Work IQ MCP.
- Auth: GitHub Copilot via system keychain (`copilot auth`). M365 via Work IQ OAuth (`workiq accept-eula`). Both one-time setup.
- No secrets in source code or logs.
- CSP defined in `src/renderer/index.html`.
- `contextBridge` restricts renderer to the typed `window.flint` API only.

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Small, focused commits. One logical change per commit.
- **Never commit or push without explicit user approval.**
