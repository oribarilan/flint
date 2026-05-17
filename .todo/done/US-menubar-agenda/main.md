# US-menubar-agenda

## Goal

Show today's meetings directly in the system tray context menu. Right-click the tray icon, see your upcoming calendar items without opening the overlay.

The data comes from `agency mcp calendar`, spawned as an HTTP subprocess. This approach was validated end-to-end: `agency` handles Entra ID auth (including the org's device-compliance CA policy) and proxies the Work IQ Calendar MCP server on localhost. We confirmed it returns real Graph API calendar data, parsed it in both Python and Swift.

## Definition of done

- [x] Right-clicking the Flint tray shows today's upcoming meetings (subject + time) above the existing "Show Flint" / "Quit" items
- [x] Meetings refresh automatically on the existing scheduler poll cadence (15 min)
- [x] Cancelled and declined meetings are filtered out
- [x] The tray badge shows the count of remaining meetings today
- [x] `.todo/backlog/wire-meeting-scheduler-data-source.md` is moved to `.todo/done/backlog/` with a supersession note
- [x] `just check` passes (lint, node typecheck, 429 tests pass; pre-existing format and web typecheck issues are unrelated)

## Task priority

Sequential -- the data source must work before the tray can show anything.

1. `1-agency-calendar-data-source.md` -- spawn and talk to `agency mcp calendar`
2. `2-tray-agenda-menu.md` -- populate the tray menu with meeting items

## Decisions

**Filter-layer ownership.** Task 1's data source returns all of today's meetings (including past ones). Task 2 filters to "upcoming" at the display layer. This lets future surfaces (renderer, overlay) show "earlier today" if useful.

**Meeting type additions.** Only add `isAllDay?: boolean` to `Meeting`. Fields like `isCancelled`, `showAs`, `responseStatus` are filtering inputs consumed inside `agency-calendar.ts` during mapping — anything reaching `Meeting` is by construction not-cancelled, not-declined. Don't pollute the shared IPC type with source-specific fields.

**Subprocess restart policy.** V1: one-shot. If the `agency` subprocess dies, log once, return `[]`. On the next poll, attempt a lazy respawn. No auto-restart with backoff (YAGNI). App restart is the full recovery path.

**Port discovery protocol.** Use `--port 0`. Read stdout lines until one matches `/^\d+$/`, with a 5s timeout. Fail closed if no port is discovered. No "use fixed port if flaky" escape hatch.

**Data source range.** The data source fetches today's calendar window. The scheduler's "next 24h" contract for alerts is preserved by having the data source use a range that covers the rest of today. Tomorrow-morning alerts are a known limitation of this story — the existing scheduler alert window only covers what the data source returns.

**Renderer parity.** This story only touches the tray. The renderer's `meetingStore` stays empty. Feeding meetings to the overlay is separate work.

## Cross-cutting concerns

**Relationship to `wire-meeting-scheduler-data-source.md`.** That backlog task planned to use `workiq ask` CLI. This story takes a different route (`agency mcp calendar` subprocess speaking MCP over HTTP) because of the org's Conditional Access policy blocking direct auth flows. Once this lands, the backlog task should be updated or superseded -- the MeetingScheduler can reuse the same data source.

**Error resilience.** If `agency` isn't installed or the subprocess dies, Flint should degrade gracefully: the tray shows no meetings, the scheduler logs a warning, no crash. Same pattern as the existing stub.

**No overlay changes.** This story only touches the tray. Meeting data may eventually flow to the renderer too, but that's separate work.

## Background

Validated `agency mcp calendar --transport http --port <port>` in a live session:
- Starts an HTTP proxy on localhost
- Accepts MCP JSON-RPC calls at `POST /` with `Accept: text/event-stream`
- `ListCalendarView` returns full Graph API `calendarView` data (subject, start/end, attendees, organizer, location, isAllDay, isCancelled, isOnlineMeeting, joinUrl)
- Auth is automatic via `msalruntime` native broker + macOS SSO extension. No app registration or manual auth step needed.
