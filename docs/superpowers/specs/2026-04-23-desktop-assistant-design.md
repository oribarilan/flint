# Flint — Desktop Personal Assistant

> **Status:** Partially superseded by `2026-04-30-v1-scope-decision.md`. The architecture (Electron + TypeScript, hotkey overlay, chat session, Work IQ MCP) still holds. The LLM-driven `MeetingMonitor` polling cadence is replaced by a deterministic 60s `MeetingScheduler` for V1. Sections describing background LLM polling are no longer authoritative.

## Overview

Repurpose Flint from an AI-native application launcher (Tauri v2 + Rust) into a desktop personal work assistant (Electron + TypeScript). The app monitors your Microsoft 365 calendar, alerts you to upcoming meetings via native OS notifications, and provides a conversational AI overlay (hotkey-activated) powered by GitHub Copilot SDK with Work IQ MCP for M365 data access.

**Target user:** Single user, personal use, local machine.
**V1 scope:** Calendar + meetings. Mail, Teams, documents deferred to later versions.

## Architecture

### Runtime: Electron + TypeScript

The entire app runs in TypeScript across two Electron processes:

- **Main process** — hosts CopilotClient (from `@github/copilot-sdk`), meeting monitor, window management, system tray, global hotkey, native notifications, config store.
- **Renderer process** — React 19 overlay UI with meeting cards, chat panel, and settings. State via Zustand. Communication with main via Electron IPC (`ipcMain`/`ipcRenderer` through a `preload.ts` contextBridge).

No sidecar processes, no second language, no bridging layers. The Copilot SDK manages its own CLI binary internally (bundled via the `@github/copilot-sdk` npm package, spawned as a child process, communicated with via JSON-RPC over stdio). Work IQ MCP server runs as a local stdio MCP server spawned by the SDK.

### Build Pipeline: electron-vite

Use `electron-vite` to manage all three build targets from a single config:

- **Main process** (`electron/main.ts`) — compiled to CommonJS for Electron main
- **Preload script** (`electron/preload.ts`) — compiled with sandboxed context in mind
- **Renderer** (`src/main.tsx`) — Vite + React, same as current setup

`electron-vite` replaces the need for separate `tsc` compilation of main/preload and unifies dev mode (HMR for renderer, restart-on-change for main). This is the standard Electron + Vite integration tool.

### Security: Tool Scoping

The Copilot SDK defaults to `--allow-all`, enabling built-in tools (file system, git, shell). This is overpowered for a calendar assistant. Both sessions must explicitly disable built-in tools and only expose custom tools + Work IQ MCP. Use `onPermissionRequest` to deny any unexpected tool invocations.

### Why Electron over Tauri

- Copilot SDK is TypeScript-native. Running it in-process eliminates all cross-language bridging.
- One language (TypeScript) for everything. No Rust, no sidecar management.
- Bundle size and memory overhead are irrelevant for a personal tool.
- Electron has mature, well-documented APIs for tray, notifications, global shortcuts, and frameless windows.

## Copilot SDK Integration

### Client Initialization

```typescript
// electron/copilot/client.ts
import { CopilotClient } from "@github/copilot-sdk";

// The SDK bundles the CLI binary automatically — no cliPath needed.
// Only provide cliPath if overriding with a custom binary.
const client = new CopilotClient();
```

The SDK bundles the Copilot CLI binary as part of `@github/copilot-sdk`. The client manages the CLI process lifecycle automatically (spawn, health check, restart).

### Session Configuration

Two sessions, each with a distinct role:

**Chat session** — user-facing conversational agent. No Work IQ MCP (reads from meeting cache instead). Only custom tools exposed.

```typescript
import { approveAll } from "@github/copilot-sdk";

const chatSession = await client.createSession({
  sessionId: "flint-main",
  model: "gpt-4.1",
  streaming: true,
  onPermissionRequest: approveAll,
  systemMessage: {
    content:
      "You are Flint, a personal work assistant. Help the user manage their calendar, meetings, and work communications. Be concise and actionable.",
  },
  tools: [getMeetingsTool, showNotificationTool, joinMeetingTool, showOverlayTool],
});
```

**Monitor session** — background calendar polling. Has Work IQ MCP for M365 access. Uses a custom tool for structured meeting data ingestion.

```typescript
const monitorSession = await client.createSession({
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
  tools: [reportMeetingsTool],
});
```

### MCP Integration

Work IQ is registered as a local (stdio) MCP server on the **monitor session only**. The SDK spawns it as a child process alongside the Copilot CLI. This avoids spawning duplicate Work IQ processes — the chat session reads from the meeting cache instead of querying M365 directly.

No separate Work IQ process management. No additional auth code — Work IQ uses the user's signed-in M365 credentials (one-time `workiq accept-eula` setup).

### Custom Tools

Electron-native actions registered as Copilot tools so the agent can trigger them:

| Tool | Session | Purpose |
|------|---------|---------|
| `report_meetings` | Monitor | Structured meeting data ingestion (typed schema, not free-text JSON) |
| `get_meetings` | Chat | Read current meetings from the in-memory cache (no M365 call) |
| `show_notification` | Chat | Fire a native OS notification with title, body, and optional action |
| `join_meeting` | Chat | Open a meeting join URL in the default browser |
| `show_overlay` | Chat | Show the Flint overlay window and optionally navigate to a meeting |

The `report_meetings` tool is critical: instead of asking the LLM to "respond as JSON" (unreliable), the monitor prompts "List my meetings for the next 3 hours and call report_meetings with them." The SDK validates tool call parameters against the schema before calling the handler — guaranteed structure, zero parsing.

### Streaming to Renderer

```typescript
session.on("assistant.message_delta", (event) => {
  overlayWindow.webContents.send("chat:delta", event.data.deltaContent);
});

session.on("session.idle", () => {
  overlayWindow.webContents.send("chat:done");
});
```

### Session Persistence

Use named sessions (`sessionId`) so conversations survive app restarts. Session state is managed by the SDK and persists across restarts automatically.

The meeting monitor uses a separate background session (`sessionId: "flint-monitor"`) to avoid polluting the user's chat history with polling queries.

### Authentication

Two independent auth chains, both one-time setup:

1. **GitHub Copilot** — the CLI uses credentials stored in the system keychain. User signs in once via `copilot auth`. The SDK picks up credentials automatically.
2. **Microsoft 365 / Work IQ** — Work IQ CLI handles M365 OAuth. User runs `workiq accept-eula` once. Credentials persist.

## Meeting Monitor

### Background Polling

Runs in Electron main process. Always active while the app is in the system tray.

**On app start:** First poll runs immediately. Subsequent polls every 15 minutes.

**Every 15 minutes:**
1. Send to monitor session: "List my meetings for the next 3 hours with times, titles, attendees, and join links. Call report_meetings with the results."
2. The `report_meetings` tool handler receives typed `Meeting[]` data (SDK validates the schema) and updates the in-memory cache.
3. Update tray icon badge with count of upcoming meetings.

**Every 60 seconds (tick against cache):**
1. For each cached meeting: if it starts within `alertMinutes` (default: 5, configurable) and hasn't been alerted yet → fire native notification.
2. Mark notified meetings in cache to prevent duplicate alerts.
3. Remove meetings that have already started and passed.
4. If overlay is open → push updated meeting data to renderer via IPC.

### System Lifecycle

The meeting monitor must handle macOS power events:

- **`powerMonitor.on('resume')`** — system woke from sleep. Immediately re-poll (timers drift during sleep). Re-validate Copilot CLI connection.
- **`powerMonitor.on('suspend')`** — system going to sleep. Pause poll timer to avoid backed-up callbacks on wake.
- **App restart** — use `resumeSession()` to restore session state. First poll runs immediately.
- **CLI crash** — listen to client connection state. On disconnect, attempt `client.stop()` then `client.start()` with exponential backoff. Surface connection state in tray icon (green = connected, yellow = reconnecting, red = failed).

### Meeting Data Model

```typescript
interface Meeting {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  organizer: string;
  joinUrl?: string;
  agenda?: string;
  alerted: boolean;
}
```

### Native Notifications

```
┌──────────────────────────────────┐
│ ⚡ Meeting in 5 min              │
│ Q4 Planning — Sarah, Mike, Lisa  │
└──────────────────────────────────┘
```

- Fired via Electron's `Notification` API.
- Click action: show overlay with meeting detail view for that specific meeting.
- macOS limitation: no custom action buttons in notifications — click is the only interaction. The overlay provides the "Join" action.
- The `alertMinutes` setting is configurable in Settings (default: 5 minutes).

## Overlay UI

### Activation

- **Global hotkey** (default: `Option+Space`, configurable) — toggles overlay visibility.
- **Notification click** — shows overlay with meeting context view.
- **Tray icon click** — shows overlay with default view.

### Window Properties

Single `BrowserWindow`: frameless, always-on-top, transparent background, centered, ~680×500px. Hidden by default, shown on activation. Same visual pattern as current Flint.

The overlay must produce a clean slate on hide: clear chat input, deselect meeting, reset to default view.

### Default View (hotkey activated)

```
┌──────────────────────────────────────┐
│ ⚡ FLINT                    ⌘, settings│
│                                      │
│ UPCOMING                             │
│ ┌──────────────────────────────────┐ │
│ │ 2:00   Q4 Planning Review       ││ │  ← amber highlight (imminent)
│ │ in 4m  Sarah, Mike, Lisa  [Join] ││ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 3:30   1:1 with Jordan          ││ │
│ │ 1h 34m Jordan Williams          ││ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 5:00   Sprint Retro             ││ │
│ │ 3h 4m  Engineering team (12)    ││ │
│ └──────────────────────────────────┘ │
│──────────────────────────────────────│
│ Ask about your schedule...       ⏎  │
└──────────────────────────────────────┘
```

- Meeting cards show time, title, attendees. Imminent meetings (within `alertMinutes`) get amber highlight and a "Join" button.
- Chat input below for conversational queries.
- Meeting cards come from the monitor's cache (instant, no network call on overlay show).
- **Loading state** (before first poll completes): "Checking your calendar..." with subtle animation.
- **Empty state** (no meetings in next 3 hours): "No upcoming meetings" with Flint spark icon.
- **Error state** (poll failed, stale cache): "Couldn't reach your calendar. Retrying..." with retry button.

### Meeting Detail View (notification click)

When a notification is clicked, the overlay opens focused on that meeting:

- Meeting title, time, status (STARTING NOW / in X min).
- Attendees list and agenda (if available).
- Large "Join Meeting" button.
- Contextual chat input: "Ask about this meeting..."
- Back button to return to default view.

### Chat Interaction

- User types a question → sent to main process via IPC → forwarded to Copilot session.
- Streaming response rendered in the chat panel as it arrives.
- The agent can call Work IQ tools to answer calendar/meeting questions.
- The agent can call custom tools (show notification, join meeting) as actions.

## Settings

Accessible via `Cmd+,` from the overlay.

| Setting | Type | Default |
|---------|------|---------|
| Global hotkey | Key combination | `Option+Space` |
| Alert timing | Minutes before meeting | 5 |
| Theme | Dark (only for v1) | Dark |
| Launch at login | Boolean | true |
| Show tray icon | Boolean | true |

Stored via `electron-store` (JSON file in app data directory). Use `electron-store`'s built-in `migrations` option for schema evolution between versions.

## IPC Contract

The preload script exposes a typed API via `contextBridge`. Only these channels are available to the renderer:

| Channel | Direction | Payload |
|---------|-----------|---------|
| `chat:send` | renderer → main | `{ prompt: string }` |
| `chat:delta` | main → renderer | `{ deltaContent: string }` |
| `chat:done` | main → renderer | `{}` |
| `meetings:update` | main → renderer | `Meeting[]` |
| `meetings:get` | renderer → main | `void → Meeting[]` |
| `meeting:join` | renderer → main | `{ joinUrl: string }` |
| `config:get` | renderer → main | `void → Config` |
| `config:set` | renderer → main | `Partial<Config>` |
| `overlay:hide` | renderer → main | `void` |

No other IPC channels are exposed. The renderer has no direct access to `ipcRenderer` — all communication goes through the typed `window.flint` API defined in `preload.ts`.

## Repo Transformation

### Remove (entire Rust backend + Tauri)

- `src-tauri/` — all Rust code, Cargo.toml, tauri.conf.json, rustfmt.toml
- Search system: SearchBar, ResultsList, useSearch, searchStore, nucleo, Spotlight indexer
- Kit system: Calculator, Clipboard, Window Management kits, registry, prefix detection
- OpenCode provider: process, client, events, monitor
- Tauri-specific frontend: lib/commands.ts, ActionPanel, HintBar, KindIcon, ResultMeta
- Old specs: spec.md, kits.md, action-panel.md, keybindings.md
- Tauri-specific skills: .claude/skills/crossplatform, debug, tauri

### Keep & Adapt

- Design tokens: `src/styles/global.css`, `src/styles/themes.css` (Flint dark theme)
- React + Zustand patterns: component structure, hook patterns
- Chat panel: ChatPanel.tsx (adapt for Copilot SDK streaming events)
- Chat store: chatStore.ts (adapt for Electron IPC instead of Tauri events)
- Settings UI shell: Settings.tsx, HotkeyRecorder.tsx (adapt for Electron)
- Build tooling: Vite (via electron-vite), TypeScript config, ESLint, Prettier
- Test infrastructure: Vitest setup, Playwright (adapt for Electron)
- Project infrastructure: Git history, .github/ CI, justfile (adapt recipes)
- Markdown rendering: lib/markdown.ts

### Add New

- `electron/` — main process: CopilotClient wrapper, session management, custom tools, meeting monitor, polling loop, cache, notification triggers, overlay window, tray, hotkey, config store
- `electron/preload.ts` — contextBridge IPC exposure
- `electron-builder.yml` — distribution config
- `tsconfig.electron.json` — main process TypeScript config
- New UI components: MeetingCards.tsx, MeetingDetail.tsx, ChatInput.tsx
- New stores: meetingStore.ts
- New hooks: useMeetings.ts
- Adapted hooks: useChat.ts (Electron IPC), useConfig.ts (Electron IPC)
- New IPC layer: `src/lib/ipc.ts` (typed wrappers replacing Tauri commands.ts)

### New Directory Structure

```
flint/
├── electron/                     # Electron main process
│   ├── main.ts                   # App entry, window creation, tray
│   ├── preload.ts                # contextBridge IPC exposure
│   ├── copilot/                  # Copilot SDK integration
│   │   ├── client.ts             # CopilotClient lifecycle
│   │   ├── session.ts            # Session management (chat + background)
│   │   └── tools.ts              # Custom tools (notify, join, overlay)
│   ├── meetings/                 # Meeting monitor
│   │   ├── monitor.ts            # Background polling loop
│   │   ├── cache.ts              # In-memory meeting cache
│   │   └── notifications.ts      # Native notification triggers
│   ├── window/                   # Window management
│   │   ├── overlay.ts            # Frameless overlay BrowserWindow
│   │   ├── tray.ts               # System tray icon + menu
│   │   └── hotkey.ts             # Global shortcut registration
│   └── config.ts                 # electron-store preferences
│
├── src/                          # React renderer (overlay UI)
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Root component
│   ├── components/
│   │   ├── MeetingCards.tsx       # Upcoming meetings list
│   │   ├── MeetingDetail.tsx     # Expanded meeting context view
│   │   ├── ChatPanel.tsx         # Conversational agent (adapted)
│   │   ├── ChatInput.tsx         # Input field with submit
│   │   └── Settings.tsx          # Settings overlay (adapted)
│   ├── hooks/
│   │   ├── useChat.ts            # Copilot chat via Electron IPC
│   │   ├── useMeetings.ts        # Meeting data from main process
│   │   └── useConfig.ts          # Config read/write via IPC
│   ├── stores/
│   │   ├── chatStore.ts          # Chat state (adapted)
│   │   └── meetingStore.ts       # Meeting cards state
│   ├── lib/
│   │   ├── ipc.ts                # Typed IPC wrappers
│   │   └── markdown.ts           # Markdown rendering (kept)
│   └── styles/
│       ├── global.css            # Design tokens (kept)
│       └── themes.css            # Dark theme (kept)
│
├── package.json                  # +electron, +electron-vite, +@github/copilot-sdk, +@microsoft/workiq
├── electron.vite.config.ts       # Unified build config (main + preload + renderer)
├── electron-builder.yml          # Distribution config
├── tsconfig.json                 # Shared TS config
├── tsconfig.electron.json        # Main process TS config
└── justfile                      # dev, build, test, package
```

## Dependencies

### Add

| Package | Purpose |
|---------|---------|
| `electron` | App shell |
| `electron-vite` | Unified build tool (main + preload + renderer) |
| `electron-builder` | Packaging & distribution |
| `electron-store` | Persistent config (JSON) |
| `@github/copilot-sdk` | Copilot agent runtime (bundles CLI) |
| `@microsoft/workiq` | Work IQ MCP server for M365 data |

### Keep

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` 19 | UI framework |
| `zustand` 5 | State management |
| `vite` / `@vitejs/plugin-react` | Renderer bundling (via electron-vite) |
| `vitest` / `@testing-library/react` | Unit tests |
| `@playwright/test` | E2E tests (adapt for Electron) |
| `typescript` (strict) | Type checking |
| `eslint` / `prettier` | Linting & formatting |

### Remove

| Package | Purpose |
|---------|---------|
| `@tauri-apps/api` + all plugins | Tauri IPC bridge |
| All Rust crates | Entire Rust backend |

## Error Handling

- **Copilot SDK connection failure** — show "Connecting to Copilot..." in chat panel. Retry with exponential backoff. Meeting cards still show from cache. Tray icon shows yellow (reconnecting) or red (failed) status.
- **Copilot CLI crash** — watchdog in main process detects disconnect, attempts `client.stop()` + `client.start()` with backoff. Monitor continues serving stale cache during recovery.
- **Work IQ auth expired** — surface inline message: "M365 session expired. Run `workiq accept-eula` to reconnect."
- **Meeting poll failure** — log warning, keep serving stale cache, retry next cycle. Never crash the monitor.
- **Notification permission denied** — fall back to in-overlay badge/alert. Surface settings prompt.
- **Overlay show failure** — log and attempt recreation of BrowserWindow.

## Testing Strategy

- **Unit tests (Vitest):** All main process modules (copilot client wrapper, meeting cache, notification logic, config). All React components and hooks with Electron IPC mocked. Mock CopilotClient entirely in tests — never hit real Copilot APIs.
- **Integration tests:** Meeting monitor end-to-end (mock Copilot responses → verify `report_meetings` tool handler → verify cache → verify notification triggers). Chat flow (mock SDK session → verify IPC → verify renderer updates).
- **E2E (Playwright + Electron):** Use Playwright's `_electron.launch()` API for native Electron testing:
  ```typescript
  const app = await _electron.launch({ args: ['./dist/electron/main.js'] });
  const window = await app.firstWindow();
  await window.waitForSelector('[data-testid="meeting-cards"]');
  ```
  Test: overlay show/hide on hotkey, meeting cards render from mock data, chat interaction with mock Copilot responses, settings persistence. Mock CopilotClient via environment variable flag that swaps in a fake client.

## Billing Note

Every 15-minute poll is a Copilot premium request (~96/day if running 24/7). For personal use this is acceptable. If quota becomes a concern: reduce poll frequency when no meetings are upcoming, restrict polling to work hours, or migrate to direct Microsoft Graph API (listed in Future Work).

## Future Work (not in v1)

- Mail triage and reply suggestions (Work IQ Mail MCP)
- Teams message summaries and quick replies (Work IQ Teams MCP)
- Document search (Work IQ Copilot search tool)
- Direct Microsoft Graph API for reliable calendar polling (replace AI-mediated polling)
- Multiple theme support (light theme)
- Cross-platform distribution (Windows, Linux)
