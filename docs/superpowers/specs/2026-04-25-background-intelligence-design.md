# Background Intelligence & Contextual Suggestions

**Date:** 2026-04-25
**Status:** Approved

## Overview

Flint runs a background process ("Pulse") that periodically queries Microsoft 365 via Work IQ to surface important calendar events, emails, and Teams messages. The LLM decides what matters, updates the attention panel, and optionally sends native notifications. The same attention data feeds contextual suggestion cards in the chat empty state.

Two subsystems:
1. **PulseScheduler** — main process scheduler that drives LLM-powered background polling
2. **Contextual Suggestions** — renderer-side pure function that derives empty-state cards from attention items

## Subsystem 1: PulseScheduler

### Location

`src/main/pulse/scheduler.ts`

### Interface

```typescript
interface PulseScheduler {
  start(): void;       // Begin scheduled polling
  stop(): void;        // Stop all timers
  pollNow(): void;     // Force an immediate poll (e.g. on wake)
}

function createPulseScheduler(config: {
  sessionManager: SessionManager;
  attentionStore: AttentionStore;
  getConfig: () => FlintConfig;
}): PulseScheduler;
```

### Adaptive Scheduling

A single user-configurable `pollFrequency` setting controls intensity. The system applies a multiplier based on time of day.

| `pollFrequency` | Base interval (work hours) | Off-hours interval |
|-----------------|---------------------------|-------------------|
| `"relaxed"` | 20 min | 60 min |
| `"normal"` (default) | 10 min | 30 min |
| `"aggressive"` | 5 min | 15 min |

Work hours: 9:00–17:00 on weekdays (hardcoded; smart detection is a backlog item).

Off-hours multiplier: 3×.

The interval is recalculated at each tick (work hours boundary may have crossed since last tick).

### Two-Phase Polling

#### Bootstrap poll (app start)

On `start()`, the first poll fires immediately. It uses a broad prompt:

```
Check my calendar for today and tomorrow, important unread emails, 
and recent Teams messages directed at me. Surface what matters.
```

This establishes the baseline so the overlay has data on first open.

#### Delta polls (subsequent)

Each subsequent poll passes a `lastPollTime` timestamp and the current attention items. The prompt is scoped:

```
Last check: {ISO timestamp}. Current items: {serialized items}.
Check for changes since last check: calendar updates, new emails, 
new Teams messages. Update items: add new, keep unchanged, remove stale.
Only notify for urgent/time-sensitive items.
```

The "delta" happens at the prompt level — the LLM asks `ask_work_iq` time-scoped natural language queries (e.g. "any new emails since 10:30?") instead of re-scanning everything. This is the best available approach given `ask_work_iq` is a natural language black box with no structured delta API.

### Power Management

- `powerMonitor.on('resume')`: calls `pollNow()` immediately
- `powerMonitor.on('suspend')`: no action needed (timers don't fire)

### Replaces MeetingMonitor

`PulseScheduler` replaces the existing (unwired) `MeetingMonitor` module entirely. `MeetingMonitor` was calendar-only with deterministic rules. Pulse is the generalized LLM-driven version. The `MeetingCache` module is no longer needed — attention items are the canonical data store.

### Overlay Focus Freeze

When the overlay window is focused (user is actively interacting), background polling is paused. Polls resume when the overlay loses focus. If a poll was due during the freeze, it fires immediately on blur. This prevents the monitor from clobbering attention items that the chat session may be actively updating.

## Monitor Session & Prompt Design

### Session Configuration

Uses the existing `flint-monitor` session from `SessionManager`:
- Non-streaming
- 90-second timeout
- Separate from the chat session (independent, no interference)

### System Prompt

```
You are Flint's background monitor. Your job is to check the user's 
Microsoft 365 data and surface important items.

You have these tools:
- ask_work_iq: Query calendar, emails, and Teams messages
- set_attention_items: Update the attention panel (silent)
- show_notification: Send a native OS notification (interrupts the user)

Guidelines:
- Notifications are for truly time-sensitive items: meetings starting 
  in <5 min, urgent emails from leadership, direct @mentions
- Attention items are for everything else worth knowing about
- Keep attention items to 5-8 max. Quality over quantity.
- Each item needs: icon (calendar/mail/message-circle), title, 
  description, and metadata for chat context
- When given existing items, preserve unchanged ones. Don't churn.
```

### Tools Available to Monitor Session

| Tool | Purpose |
|------|---------|
| `ask_work_iq` | Query M365 data (calendar, email, Teams) |
| `set_attention_items` | Update attention panel silently |
| `show_notification` | Fire native OS notification (LLM decides when) |

The LLM has full autonomy over whether to notify vs silently surface items.

### `sendMonitorPoll` Signature

The `SessionManager.sendMonitorPoll()` signature is updated to accept poll context: `sendMonitorPoll(context: { lastPollTime?: string; currentItems: AttentionItem[] })`. The prompt builder uses this to generate either a bootstrap prompt (no `lastPollTime`) or a delta prompt.

## Subsystem 2: Contextual Suggestions

### Location

`src/renderer/src/utils/suggestions.ts`

### Interface

```typescript
interface Suggestion {
  icon: string;
  title: string;
  description: string;
}

function buildSuggestions(items: AttentionItem[]): Suggestion[];
```

### Logic

1. Map attention items to suggestion cards by `icon` type:
   - `calendar` → "Prepare me for [title]"
   - `mail` → "Summarize email from [description]"
   - `message-circle` → "Catch up on [title]"
   - Other icon types (e.g. `file-text`, `alert-triangle`) are skipped — not all attention items make good suggestions
2. Cap contextual cards at 3 (leave room for at least 1 static default)
3. Fill remaining slots with static defaults from the current `SUGGESTIONS` array. Each static suggestion has a `category` tag (e.g. `'meeting-prep'`, `'schedule'`, `'conflicts'`). Each contextual card declares which category it replaces. When filling remaining slots with static defaults, any static suggestion whose category is already covered by a contextual card is skipped. This makes dedup deterministic and fully testable.
4. Return 3–4 cards total. Never scrolls.

### Visual Treatment

Seamless — contextual cards look identical to static ones. Only the text changes. No tinting, no sections.

### Performance

Reads from the Zustand attention store (already in memory). No IPC, no network, no disk I/O. The overlay-ready critical path is preserved — `buildSuggestions` renders whatever's in the store instantly. The background process populates the store asynchronously.

## Wiring & Architecture Changes

### index.ts Refactor

The current `index.ts` bypasses `CopilotManager` and `SessionManager`, wiring everything inline. This feature requires using those modules as intended.

**New startup sequence:**

```
App start
  → CopilotManager.start()
    → SessionManager (lazy sessions: chat + monitor)
  → PulseScheduler.start(sessionManager, attentionStore)
    → Bootstrap poll (immediate)
    → Scheduled delta polls
    → Power management (resume → pollNow)
  → registerIpcHandlers (chat, config, attention, etc.)
  → createOverlayWindow + tray + hotkey
```

### MeetingMonitor Removal

`src/main/meetings/monitor.ts` and `src/main/meetings/cache.ts` are removed. Their responsibilities are absorbed:
- Background polling → `PulseScheduler`
- Meeting data → attention items (LLM-curated)
- Notifications → LLM-driven via `show_notification` tool
- Power management → `PulseScheduler`

The `report_meetings` tool is also removed from `tools.ts`. It was tied to the old `MeetingMonitor` pipeline and is replaced by the monitor session's `set_attention_items` and `show_notification` tools.

`src/main/meetings/notifications.ts` stays — it's the utility that fires OS notifications.

### Config Changes

New fields in `FlintConfig`:

```typescript
// Background Agent settings
pollEnabled: boolean;              // default: true
pollFrequency: "relaxed" | "normal" | "aggressive";  // default: "normal"
pollModel: string;                 // default: "gpt-4.1-mini" — separate from chat model
```

These settings appear in a dedicated "Background Agent" tab in settings. The UI for this tab is out of scope for this spec.

Requires an electron-store migration.

### IPC

`connection:status` (already defined, never sent) gets wired so the renderer can show connectivity state. No new IPC channels needed — attention items flow through the existing `attention:update` pipeline.

The `set_attention_items` tool callback handles both writing to `AttentionStore` and sending the `attention:update` IPC to the renderer. This is the same pattern as the current inline implementation in `index.ts` — it just moves into the tool factory's `onAttentionUpdate` callback parameter.

### What Stays the Same

- Chat flow (`chat:send` → streaming → `chat:done`)
- `AttentionStore` + IPC push to renderer
- `attentionStore` (Zustand) in renderer
- Overlay window, tray, hotkey

### System Message Consolidation

The rich system message currently inline in `index.ts` (mentioning attention panel, `set_attention_items`, Work IQ tools) becomes the canonical chat system prompt in `SessionManager`. The minimal system message in `sessions.ts` is replaced.

### CopilotManager `cliPath`

`CopilotManager` will accept an optional `cliPath` parameter. The hardcoded path in `index.ts` (`/opt/homebrew/bin/copilot`) moves into a resolved configuration — environment variable, PATH lookup, or platform-specific default.

## Error Handling & Edge Cases

### Poll Failures

- `ask_work_iq` failure or timeout (90s): current attention items stay unchanged. Logged as `[pulse] poll failed: <error>`.
- After 3 consecutive failures: warning logged `[pulse] 3 consecutive poll failures, will retry next interval`.
- Never crashes the main process. Never shows error UI for background failures.

### Copilot Not Connected

- If `CopilotManager` status is `disconnected`, skip the poll. Don't queue.
- On reconnection, `pollNow()` immediately.

### Empty Results

- Zero attention items is valid (quiet day). Empty state shows all static suggestion defaults.

### Race Condition — User Chatting During Poll

- Monitor and chat are independent sessions. They don't interfere.
- If both call `set_attention_items` simultaneously, last-write-wins on `AttentionStore`. Acceptable since both are LLM-curated.

### App Start Without Auth

- If Work IQ auth isn't set up, bootstrap poll fails gracefully. Attention panel stays empty, suggestions show static defaults. App is fully usable for chat.

### System Sleep/Wake

- `powerMonitor.resume`: `pollNow()` immediately.
- `powerMonitor.suspend`: no action (timers don't fire during sleep).

## Testing Strategy

### Unit Tests

| Module | Tests |
|--------|-------|
| `PulseScheduler` | Interval calculation (work hours vs off-hours), frequency config mapping, `pollNow()` triggers immediate poll, `stop()` clears timers, overlay focus freeze (pause on focus, resume on blur, immediate poll on deferred tick) |
| `buildSuggestions` | No items → 3-4 static defaults. Calendar item → "Prepare me for [title]" replaces generic. Mail item → email suggestion. 3+ contextual → capped at 3 + 1 static. Category-based dedup (contextual meeting-prep card suppresses generic meeting-prep static). Unmapped icon types skipped. Always 3-4 cards. |
| Monitor prompt builder | Bootstrap prompt has no timestamp/items. Delta prompt includes timestamp and serialized items. |

### Integration Tests (Main Process)

| Scenario | Verification |
|----------|-------------|
| Startup → bootstrap poll | `sendMonitorPoll` called once immediately with no `lastPollTime` |
| Interval tick | Poll called again after configured interval |
| Poll failure | Items unchanged, no crash, next poll scheduled normally |
| Power resume | `pollNow()` called |
| Config change (`pollFrequency`) | Next interval uses new frequency |
| `index.ts` refactor | `chat:send` → delta → done flow works end-to-end after switching to `CopilotManager`/`SessionManager` |

### Not Tested

- LLM response quality (non-deterministic, manual QA)
- `ask_work_iq` integration (mock at session boundary)
- Renderer attention store (already tested)

## Work IQ Constraints

`@microsoft/workiq` exposes a single tool: `ask_work_iq({ question: string })`. It is a natural language black box — no structured parameters, no time range filters, no delta tokens.

True API-level delta queries (available in raw Microsoft Graph) are not exposed through Work IQ MCP. The delta polling design uses prompt-level time scoping as the best available alternative.

If structured MCP servers (`mcp_CalendarTools`, `mcp_MailTools`, `mcp_TeamsServer` from the Agent 365 platform) become practical to adopt, they would enable precise parameterized queries — but require separate Entra app registration and more complex auth. This is a future optimization path.

The current `ask_work_iq` mock in `tools.ts` has a date mutation bug and only covers calendar data. As part of this feature, the mock will be fixed and extended to cover email and Teams message scenarios, enabling development and testing without real M365 credentials.
