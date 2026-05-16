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

- [ ] The tray context menu shows today's upcoming meetings (not past ones) above "Show Flint"
- [ ] Each meeting item displays: time (HH:MM) and subject, truncated if needed (e.g. `10:30  Sprint Planning`)
- [ ] All-day events are shown with "All day" instead of a time
- [ ] A separator divides meeting items from "Show Flint" / "Quit"
- [ ] If there are no upcoming meetings, a disabled "No more meetings today" item appears
- [ ] Clicking a meeting item with a `joinUrl` opens it in the default browser
- [ ] Clicking a meeting item without a `joinUrl` opens the overlay (same as "Show Flint")
- [ ] The tray menu rebuilds after each scheduler poll (every 15 min)
- [ ] `updateTrayBadge(count)` is called with the count of remaining meetings today after each poll
- [ ] The tray rebuild does not block the main thread (menu template is built synchronously from cached data, no network calls)
- [ ] Unit tests cover: menu template generation with 0, 1, and N meetings; all-day event formatting; past-event filtering; join URL click behavior
- [ ] `just check` passes

## Verification

**Automated (required):**
- Tests for a `buildTrayMenuTemplate(meetings)` pure function that returns an Electron `MenuItemConstructorOptions[]`. This is the testable unit -- it takes meetings, returns menu items. No Electron mocking needed for the template builder.

**Ad-hoc:**
- Run `just dev`, right-click tray icon, confirm meetings appear.
- Wait for a poll cycle (or trigger manually), confirm the menu updates.
- Click a meeting with a Teams link, confirm it opens in the browser.
- Confirm the tray title/badge shows the meeting count.

## Notes

- Electron's `Tray.setContextMenu()` replaces the entire menu. Rebuild the full template on each update, including the static items.
- Keep the menu builder as a pure function that takes `Meeting[]` and returns the template. Wire it in `tray.ts` and expose an `updateTrayMeetings(meetings)` function.
- Time formatting: use the meeting's time zone from the Graph API response. Display in local time. If `Intl.DateTimeFormat` is available in the main process, use it.
- Truncate long subjects to ~40 chars with ellipsis. The tray menu has limited horizontal space.
- Past-event filtering: compare `meeting.startTime` against `Date.now()`. For all-day events, keep them visible until end-of-day.
- The existing `updateTrayBadge` function is already exported but unused. Wire it after each poll.
