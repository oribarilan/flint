# 1-agency-calendar-data-source

## Context

Flint needs a way to fetch real calendar data from Microsoft 365. Direct Graph API auth fails on our org because of a Conditional Access policy requiring managed devices -- device-code flow can't prove compliance, and Python MSAL's interactive flow uses a client ID that isn't preauthorized for Graph Calendar scopes.

`agency mcp calendar` solves this. It's a CLI tool (already installed) that spawns an HTTP proxy on localhost, handles Entra ID auth via the native MSAL broker (which satisfies device-compliance CA policies), and proxies MCP JSON-RPC calls to the Work IQ Calendar MCP server.

The data source module spawns `agency mcp calendar --transport http` as a child process, discovers its port, and exposes a `fetchTodayMeetings()` function that calls `ListCalendarView` and maps the response to `Meeting[]`.

**Value delivered**: Flint can fetch real calendar data on machines with strict enterprise CA policies. The MeetingScheduler gets a working data source. The tray agenda (task 2) has something to display.

## Related files

- `src/main/types.ts` -- `Meeting` interface (the target shape)
- `src/main/index.ts:54-66` -- current `fetchUpcomingMeetings()` stub returning `[]`
- `src/main/scheduler/meeting-scheduler.ts` -- consumer of the fetch function

## Dependencies

None. This replaces the V1 stub.

## Acceptance criteria

- [ ] New module `src/main/calendar/agency-calendar.ts` (or similar) with:
  - `startAgencyCalendar()` -- spawns `agency mcp calendar --transport http --port 0`, reads the port from stdout, returns a handle
  - `stopAgencyCalendar()` -- kills the subprocess
  - `fetchTodayMeetings()` -- POSTs a `ListCalendarView` MCP call to localhost, parses the SSE `data:` response, maps Graph API events to `Meeting[]`
- [ ] Graph API event fields are mapped to the `Meeting` interface. Fields not in `Meeting` today (like `isAllDay`, `isCancelled`, `showAs`) should be added to the type if needed for filtering
- [ ] Cancelled events (`isCancelled: true`) and declined events (`responseStatus.response === "declined"`) are filtered out before returning
- [ ] `fetchTodayMeetings()` has a timeout (10s). On timeout, subprocess crash, or parse failure, it logs a warning and returns `[]`
- [ ] The subprocess port is discovered by reading stdout after spawn (agency prints the port number on its own line)
- [ ] `fetchUpcomingMeetings()` in `index.ts` is replaced with a call to this module
- [ ] Unit tests cover: successful parse with real-shaped fixture data, empty calendar, malformed response, timeout, subprocess not found
- [ ] `just check` passes

## Verification

**Automated (required):**
- `src/main/__tests__/calendar/agency-calendar.test.ts` -- mock `child_process.spawn` and HTTP responses. Fixture data should match the real Graph API shape (use the response captured during validation as a template).

**Ad-hoc:**
- Run `just dev` on a machine with `agency` installed and `workiq accept-eula` complete.
- Confirm meetings appear in the console log from the scheduler poll.
- Kill the `agency` subprocess manually, confirm Flint logs a warning and continues running with empty meeting list.

## Notes

- The MCP endpoint is `POST /` (not `/mcp`). The `Accept` header must include `text/event-stream`. Response is SSE format: `data: {jsonrpc response}`.
- `agency mcp calendar --transport http --port 0` picks a random port and prints it to stdout. Use `--port <fixed>` if random-port discovery is too flaky.
- The `ListCalendarView` tool accepts `startDateTime`, `endDateTime`, `top`, and `userIdentifier` (defaults to `me`). Use ISO 8601 UTC timestamps.
- The response text field starts with `"Calendar view retrieved successfully.\n"` followed by the JSON payload. Split on the first newline to get the parseable JSON.
- Graph API events use `start.dateTime` / `end.dateTime` (ISO strings) and `start.timeZone` / `end.timeZone`. Convert to ISO 8601 for the `Meeting` type.
- `agency` caches auth tokens automatically -- first call may take a few seconds for interactive browser auth, subsequent calls are fast (~250ms per the logs).
- If `agency` is not on PATH, the spawn will fail. Handle this as a graceful degradation, not a crash.
