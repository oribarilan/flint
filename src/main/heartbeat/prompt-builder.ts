import type { Meeting } from "../types";

/** Build the user prompt for a periodic heartbeat beat. */
export function buildBeatPrompt(meetings: Meeting[], preppedIds: Set<string>, now: Date): string {
  const timeStr = now.toISOString();
  const preppedList = preppedIds.size > 0 ? [...preppedIds].join(", ") : "none";

  if (meetings.length === 0) {
    return [
      `Current time: ${timeStr}`,
      `Already prepped: ${preppedList}`,
      "",
      "No meetings today. Check if there is anything else the user should know about.",
    ].join("\n");
  }

  const meetingLines = meetings
    .filter((m) => !m.isAllDay)
    .map((m) => {
      const start = new Date(m.startTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const end = new Date(m.endTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const n = m.attendees.length;
      return `- ID: "${m.id}" | "${m.title}" | ${start} \u2013 ${end} | ${String(n)} attendee${n !== 1 ? "s" : ""}`;
    })
    .join("\n");

  return [
    `Current time: ${timeStr}`,
    `Already prepped: ${preppedList}`,
    "",
    "Today's meetings:",
    meetingLines,
    "",
    "Prep the next unprepped meeting. Flag anything the user should know about.",
  ].join("\n");
}

/** Build a focused prompt for on-demand prep of a single meeting. */
export function buildPrepPrompt(meeting: Meeting, now: Date): string {
  const start = new Date(meeting.startTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(meeting.endTime).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const n = meeting.attendees.length;

  return [
    `Current time: ${now.toISOString()}`,
    "",
    "Prepare the user for this meeting:",
    `- ID: "${meeting.id}" | "${meeting.title}" | ${start} \u2013 ${end} | ${String(n)} attendee${n !== 1 ? "s" : ""}`,
    "",
    "Generate 3-5 prep bullets and call cache_meeting_prep.",
  ].join("\n");
}
