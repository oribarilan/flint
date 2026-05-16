/**
 * Fixture data formerly served by the in-process `ask_work_iq` mock.
 *
 * Moved here when `wire-real-work-iq` replaced the mock with a real Work IQ MCP
 * subprocess. Kept for use by integration tests that mock the MCP boundary so the
 * SDK does not need to spawn `npx workiq mcp` during the test run.
 */

/** Create a new Date with specific hours/minutes on a given day without mutating the source. */
function timeOnDate(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export interface MockMeeting {
  type: "meeting";
  title: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  organizer: string;
  joinUrl: string;
  location: string;
}

export interface MockEmail {
  type: "email";
  subject: string;
  from: string;
  receivedAt: string;
  preview: string;
  isRead: boolean;
  importance: string;
}

export interface MockTeamsMessage {
  type: "teams_message";
  from: string;
  channel: string;
  sentAt: string;
  content: string;
}

export function getMockMeetings(now: Date = new Date()): MockMeeting[] {
  const today = now;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sunday = new Date(today);
  sunday.setDate(sunday.getDate() + (7 - sunday.getDay()));

  return [
    {
      type: "meeting",
      title: "Q4 Planning Review",
      startTime: timeOnDate(today, 14, 0).toISOString(),
      endTime: timeOnDate(today, 15, 0).toISOString(),
      attendees: ["Sarah Chen", "Mike Ross", "Lisa Park"],
      organizer: "Sarah Chen",
      joinUrl: "https://teams.microsoft.com/meet/q4-planning",
      location: "Teams",
    },
    {
      type: "meeting",
      title: "1:1 with Jordan",
      startTime: timeOnDate(today, 15, 30).toISOString(),
      endTime: timeOnDate(today, 16, 0).toISOString(),
      attendees: ["Jordan Williams"],
      organizer: "You",
      joinUrl: "https://teams.microsoft.com/meet/1on1-jordan",
      location: "Teams",
    },
    {
      type: "meeting",
      title: "Sprint Retro",
      startTime: timeOnDate(today, 17, 0).toISOString(),
      endTime: timeOnDate(today, 17, 30).toISOString(),
      attendees: ["Engineering Team"],
      organizer: "Mike Ross",
      joinUrl: "https://teams.microsoft.com/meet/sprint-retro",
      location: "Teams",
    },
    {
      type: "meeting",
      title: "Design Review",
      startTime: timeOnDate(tomorrow, 10, 0).toISOString(),
      endTime: timeOnDate(tomorrow, 11, 0).toISOString(),
      attendees: ["Design Team"],
      organizer: "Lisa Park",
      joinUrl: "https://teams.microsoft.com/meet/design-review",
      location: "Teams",
    },
    {
      type: "meeting",
      title: "Weekend Sync",
      startTime: timeOnDate(sunday, 11, 0).toISOString(),
      endTime: timeOnDate(sunday, 11, 30).toISOString(),
      attendees: ["Sarah Chen"],
      organizer: "You",
      joinUrl: "https://teams.microsoft.com/meet/weekend-sync",
      location: "Teams",
    },
  ];
}

export function getMockEmails(now: Date = new Date()): MockEmail[] {
  const t = now.getTime();
  return [
    {
      type: "email",
      subject: "Budget approval needed",
      from: "Sarah Chen",
      receivedAt: new Date(t - 2 * 3600_000).toISOString(),
      preview: "Hi, please review and approve the Q4 budget allocation by EOD Friday.",
      isRead: false,
      importance: "high",
    },
    {
      type: "email",
      subject: "Re: Q4 Report Draft",
      from: "Mike Ross",
      receivedAt: new Date(t - 5 * 3600_000).toISOString(),
      preview: "Updated the draft with the latest numbers. Let me know if the charts look right.",
      isRead: true,
      importance: "normal",
    },
    {
      type: "email",
      subject: "Team offsite logistics",
      from: "Lisa Park",
      receivedAt: new Date(t - 24 * 3600_000).toISOString(),
      preview: "Sharing the venue details and agenda for next week's offsite.",
      isRead: true,
      importance: "normal",
    },
  ];
}

export function getMockTeamsMessages(now: Date = new Date()): MockTeamsMessage[] {
  const t = now.getTime();
  return [
    {
      type: "teams_message",
      from: "Jordan Williams",
      channel: "Direct Message",
      sentAt: new Date(t - 30 * 60_000).toISOString(),
      content: "Are we still on for 3:30?",
    },
    {
      type: "teams_message",
      from: "Mike Ross",
      channel: "Engineering",
      sentAt: new Date(t - 3 * 3600_000).toISOString(),
      content: "Pushed the hotfix to staging, ready for review.",
    },
    {
      type: "teams_message",
      from: "Sarah Chen",
      channel: "Leadership",
      sentAt: new Date(t - 6 * 3600_000).toISOString(),
      content: "Reminder: Q4 targets due by Friday.",
    },
  ];
}
