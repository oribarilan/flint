import type { Meeting, MenubarTimeStyle } from "../types";

const MAX_TITLE_LENGTH = 16;
/** After this many ms into a meeting, stop showing "now" and move to the next. */
export const ACTIVE_THRESHOLD_MS = 10 * 60_000;

/** Truncate with ellipsis. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

export interface DisplayMeeting {
  meeting: Meeting;
  isActive: boolean;
}

/**
 * Pick the meeting to display in the menubar.
 *
 * "Active" = started within the last ACTIVE_THRESHOLD_MS and not yet ended.
 * After the threshold, skip to the next upcoming meeting.
 */
export function selectDisplayMeeting(
  meetings: Meeting[],
  nowMs: number,
): DisplayMeeting | null {
  // Find an "active" meeting (started recently, still in progress)
  for (const m of meetings) {
    if (m.isAllDay) continue;
    const start = new Date(m.startTime).getTime();
    const end = new Date(m.endTime).getTime();
    if (start <= nowMs && nowMs < start + ACTIVE_THRESHOLD_MS && end > nowMs) {
      return { meeting: m, isActive: true };
    }
  }

  // Find the next upcoming non-all-day meeting
  let earliest: Meeting | null = null;
  let earliestMs = Infinity;
  for (const m of meetings) {
    if (m.isAllDay) continue;
    const start = new Date(m.startTime).getTime();
    if (start > nowMs && start < earliestMs) {
      earliest = m;
      earliestMs = start;
    }
  }
  if (earliest) return { meeting: earliest, isActive: false };

  // Fall back to an all-day event (today only — caller filters)
  const allDay = meetings.find((m) => m.isAllDay);
  if (allDay) return { meeting: allDay, isActive: false };

  return null;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Format the menubar text for a given display meeting and config.
 * Pure function — no side effects.
 */
export function formatMenubarText(
  display: DisplayMeeting | null,
  timeStyle: MenubarTimeStyle,
  showTitle: boolean,
  nowMs: number,
): string {
  if (!display) return "";

  const { meeting, isActive } = display;
  const parts: string[] = [];

  if (timeStyle !== "off") {
    if (isActive) {
      parts.push("now");
    } else if (meeting.isAllDay) {
      // Skip time component for all-day events
    } else if (timeStyle === "next-time") {
      parts.push(timeFormatter.format(new Date(meeting.startTime)));
    } else {
      // countdown
      const diffMs = new Date(meeting.startTime).getTime() - nowMs;
      const mins = Math.max(1, Math.ceil(diffMs / 60_000));
      parts.push(`in ${String(mins)}m`);
    }
  }

  if (showTitle) {
    parts.push(truncate(meeting.title, MAX_TITLE_LENGTH));
  }

  return parts.join(" \u00b7 ");
}
