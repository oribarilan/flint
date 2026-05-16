# US-menubar-agenda

## Goal

Show today's meetings directly in the system tray context menu. Right-click the tray icon, see your upcoming calendar items without opening the overlay.

The data comes from `agency mcp calendar`, spawned as an HTTP subprocess. This approach was validated end-to-end: `agency` handles Entra ID auth (including the org's device-compliance CA policy) and proxies the Work IQ Calendar MCP server on localhost. We confirmed it returns real Graph API calendar data, parsed it in both Python and Swift.

## Definition of done

- [ ] Right-clicking the Flint tray shows today's upcoming meetings (subject + time) above the existing "Show Flint" / "Quit" items
- [ ] Meetings refresh automatically on the existing scheduler poll cadence (15 min)
- [ ] Cancelled and declined meetings are filtered out
- [ ] The tray badge shows the count of remaining meetings today
- [ ] `just check` passes

## Task priority

Sequential -- the data source must work before the tray can show anything.

1. `1-agency-calendar-data-source.md` -- spawn and talk to `agency mcp calendar`
2. `2-tray-agenda-menu.md` -- populate the tray menu with meeting items

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
