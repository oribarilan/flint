# 2-tray-agenda-menu

## Context

With the `agency-calendar` data source wired (task 1), Flint has access to today's meetings. This task puts them in the system tray context menu so you can glance at your schedule without opening the overlay.

Currently the tray menu has two items: "Show Flint" and "Quit". This task adds meeting items above them, separated by a divider.

**Value delivered**: Right-click the tray icon, see your day at a glance. The thing you'd otherwise open Outlook or the overlay for.

## Related files

- `src/main/window/tray.ts` -- current tray implementation (46 LOC, 2 menu items)
- `src/main/scheduler/meeting-scheduler.ts` -- drives the poll/tick cycle
- `src/main/types.ts` -- `Meeting` interface
- `src/main/calendar/agency-calendar.ts` -- data source (from task 1)
- `src/main/index.ts` -- wiring

## Dependencies

- `1-agency-calendar-data-source.md` -- needs the data source to populate the menu

## Acceptance criteria

### Scheduler callback (prerequisite wiring)

- [x] `onMeetingsUpdated?: (meetings: Meeting[]) => void` is added to `MeetingSchedulerConfig` in `meeting-scheduler.ts`. Called inside `poll()` after `cache = meetings` on successful fetch. Not called on fetch failure (scheduler preserves stale cache).
- [x] `index.ts` wires `onMeetingsUpdated` to call `updateTrayMeetings()` and `updateTrayBadge()` with the count of remaining (future) meetings
- [x] Existing scheduler tests are extended: `onMeetingsUpdated` fires after successful poll with the polled meetings, does not fire on fetch failure, callback errors do not crash scheduler

### Menu content

- [x] The tray context menu shows today's upcoming meetings (not past ones) above "Show Flint"
- [x] Past-event filtering compares against a `now` seam (injectable for tests, `Date.now()` in production). In-progress meetings (started but not ended) remain visible until `endTime`.
- [x] Each meeting item displays: time (HH:MM in local time) and subject, truncated to ~40 chars with ellipsis (e.g., `10:30  Sprint Planning`)
- [x] Subject text is sanitized: control characters (`\r`, `\n`, zero-width) stripped, `&` escaped (creates menu accelerators on macOS)
- [x] All-day events are shown with "All day" instead of a time. They sort above timed events and remain visible until midnight local time.
- [x] A separator divides meeting items from "Show Flint" / "Quit"
- [x] If there are no upcoming meetings, a disabled "No more meetings today" item appears
- [x] Menu items are capped at 10. If more exist, a final disabled item shows "+N more" (or "Show all in Flint")

### Click behavior

- [x] Clicking a meeting item with a `joinUrl` opens it via `openExternalUrl(joinUrl)` (from `src/main/lib/url.ts`), not raw `shell.openExternal`. This preserves the existing URL scheme validation.
- [x] Clicking a meeting item without a `joinUrl` opens the overlay (same as "Show Flint")

### Tray updates

- [x] The tray menu rebuilds after each scheduler poll (every 15 min) via the `onMeetingsUpdated` callback
- [x] `updateTrayBadge(count)` is called with the count of remaining meetings today after each poll. Badge is capped at "9+" for double digits.
- [x] The tray rebuild does not block the main thread (menu template is built synchronously from cached data, no network calls)

### Testability

- [x] `buildTrayMenuTemplate(meetings, options)` is a pure function accepting `{ onJoin: (url: string) => void, onShowOverlay: () => void, now?: () => number }`. This makes click handlers and time-dependent filtering testable.
- [x] Unit tests cover: menu template generation with 0, 1, and N meetings; all-day event formatting and sorting; past-event filtering; in-progress meeting visibility; join URL click behavior (assert `onJoin` called with URL); no-joinUrl click behavior (assert `onShowOverlay` called); subject truncation at boundary (40 and 41 chars); `&` escaping; menu item cap with overflow; badge cap
- [x] `just check` passes

## Verification

**Automated (required):**
- Tests for `buildTrayMenuTemplate(meetings, options)` pure function that returns `MenuItemConstructorOptions[]`. Injectable `onJoin`/`onShowOverlay` callbacks let tests assert click behavior without Electron mocking. Injectable `now` seam lets tests control time for past-event filtering.
- Extend `meeting-scheduler.test.ts` with tests for `onMeetingsUpdated` callback behavior.

**Ad-hoc:**
- Run `just dev`, right-click tray icon, confirm meetings appear.
- Wait for a poll cycle (or trigger manually), confirm the menu updates.
- Click a meeting with a Teams link, confirm it opens in the browser.
- Confirm the tray title/badge shows the meeting count.

## Notes

- Electron's `Tray.setContextMenu()` replaces the entire menu. Rebuild the full template on each update, including the static items.
- Keep the menu builder as a pure function that takes `Meeting[]` and options, returns the template. Wire it in `tray.ts` and expose an `updateTrayMeetings(meetings)` function.
- Time formatting: `Meeting.startTime` is UTC ISO 8601 (converted by Task 1). Display in local time using `Intl.DateTimeFormat` in the main process.
- Past-event filtering: compare `meeting.endTime` (not `startTime`) against `now()` so in-progress meetings remain visible. For all-day events, "end-of-day" means midnight in the user's local timezone.
- Truncate long subjects to ~40 chars with ellipsis. Sanitize first (strip control chars, escape `&`), then truncate.
- The existing `updateTrayBadge` function is already exported but unused. Wire it after each poll via `onMeetingsUpdated`.
- Day boundary: if the app runs past midnight, the tray shows stale "today" data for up to 15 min until the next poll. Acceptable for V1.
- Use `openExternalUrl` from `src/main/lib/url.ts` for join URLs — it validates URL schemes.
