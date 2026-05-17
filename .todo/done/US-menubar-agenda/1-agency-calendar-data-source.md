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

### Module shape

- [x] New module `src/main/calendar/agency-calendar.ts` using the factory pattern (`createAgencyCalendarSource(config)` returning an interface). No module-level singletons with hidden state.
  - `start()` -- spawns `agency mcp calendar --transport http --port 0`, discovers port from stdout, returns a ready promise
  - `stop()` -- kills the subprocess (idempotent). Uses `SIGTERM`; no `SIGKILL` escalation needed for V1
  - `fetchTodayMeetings()` -- POSTs a `ListCalendarView` MCP call to `http://127.0.0.1:<port>/`, parses the SSE `data:` response, maps Graph API events to `Meeting[]`

### Binary resolution

- [x] `agency` binary is resolved similarly to `resolveCopilotCliPath()` in `index.ts` (env var → PATH lookup → macOS fallback). Electron launched from Finder has a stripped `PATH`.

### Type changes

- [x] `isAllDay?: boolean` is added to the `Meeting` interface in `src/main/types.ts`. No other fields are added -- `isCancelled`, `showAs`, and `responseStatus` are consumed during mapping and discarded.

### Field mapping

- [x] Graph API fields are mapped to `Meeting` with these rules:
  - `title` ← Graph `subject`, fallback `"(No subject)"`
  - `startTime` / `endTime` ← UTC ISO 8601 (converted from Graph's wall-clock `start.dateTime` + `start.timeZone` using timezone-aware conversion -- not naive `new Date(dt).toISOString()`)
  - `attendees` ← display names (or emails as fallback), consistently chosen
  - `organizer` ← organizer name/email
  - `joinUrl` ← Graph `joinUrl` or `onlineMeeting.joinUrl`, if present
  - `isAllDay` ← Graph `isAllDay`
  - `agenda` ← Graph `bodyPreview` if non-empty, otherwise unset

### Filtering

- [x] Cancelled events (`isCancelled: true`) and declined events (`responseStatus.response === "declined"`) are filtered out before returning. These fields are never stored on `Meeting`.

### Schema validation

- [x] MCP/Graph response is validated against a Zod schema at the boundary (consistent with `ChatSendPromptSchema` pattern). Per-entry validation failures are logged with `[agency-calendar]` prefix and skipped -- the entire poll is not failed by one malformed event.

### Error handling

- [x] `fetchTodayMeetings()` has a 10s timeout for HTTP calls. On timeout, HTTP error, or JSON-RPC error, it logs a warning and returns `[]`
- [x] Subprocess spawn failure (e.g., `ENOENT` -- `agency` not installed) logs once with `[agency-calendar]` prefix and degrades gracefully. Does not retry spawn every 15 min.
- [x] If the subprocess dies between polls, the next `fetchTodayMeetings()` call detects it and attempts a lazy respawn (one attempt). If respawn fails, logs and returns `[]`.
- [x] Subprocess stderr is piped and logged with `[agency]` prefix. Avoid logging stdout/stderr wholesale if it may contain PII or tokens -- log selectively.

### Port discovery

- [x] Port is discovered by reading stdout lines until one matches `/^\d+$/`, validated as integer in range 1-65535
- [x] Port discovery has a 5s timeout (separate from the 10s fetch timeout). On timeout, start is considered failed.
- [x] Subprocess is spawned with `{ shell: false }` to avoid shell interpolation

### Lifecycle wiring

- [x] `start()` is called during `app.whenReady()` in `index.ts`, before `createMeetingScheduler()`. Start may run in parallel with Copilot startup.
- [x] `stop()` is called in `app.on("will-quit")` in `index.ts`, after `meetingScheduler.stop()`, before `copilotManager.stop()`
- [x] `fetchUpcomingMeetings()` stub in `index.ts` is replaced with a call to `fetchTodayMeetings()` from this module

### Backlog cleanup

- [x] `.todo/backlog/wire-meeting-scheduler-data-source.md` is moved to `.todo/done/backlog/` with a note that it is superseded by `US-menubar-agenda`

### Tests and checks

- [x] Unit tests cover: successful parse with real-shaped fixture data (committed as `src/main/__tests__/fixtures/agency-calendar-response.json`, PII scrubbed), empty calendar, per-entry malformed event (skipped, others returned), timeout, subprocess not found (`ENOENT`), port discovery timeout, non-UTC timezone conversion, cancelled/declined filtering, all-day event mapping
- [x] `just check` passes

## Verification

**Automated (required):**
- `src/main/__tests__/calendar/agency-calendar.test.ts` -- mock `child_process.spawn` and HTTP responses. Test SSE parsing (the `data:` prefix stripping, the `"Calendar view retrieved successfully.\n"` preamble) with dedicated cases -- this is the most fragile parsing path.
- Fixture data committed as `src/main/__tests__/fixtures/agency-calendar-response.json` matching the real Graph API shape, PII scrubbed. Include at least one non-UTC timezone fixture (e.g., `"2026-05-16T10:00:00"` in `"America/Los_Angeles"`) to catch wall-clock-vs-UTC conversion bugs.

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
