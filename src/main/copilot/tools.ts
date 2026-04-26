import { Notification, shell } from "electron";
import { defineTool, type Tool } from "@github/copilot-sdk";
import type { AttentionItem } from "../types";

interface ToolCallbacks {
  onShowOverlay: () => void;
  onAttentionUpdate: (items: AttentionItem[]) => void;
}

/** Create a new Date with specific hours/minutes on a given day without mutating the source. */
function timeOnDate(base: Date, hours: number, minutes: number): Date {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** Parse time scope from query strings like "since 10:30", "after 2:00 PM", "since 14:00". */
export function parseTimeScope(query: string): Date | null {
  const match = /(?:since|after)\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i.exec(query);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3] ? match[3].toLowerCase() : undefined;

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return timeOnDate(new Date(), hours, minutes);
}

export function createAllTools(callbacks: ToolCallbacks): Tool[] {
  // ── Mock Work IQ (replace with real MCP when available) ──
  const askWorkIq = defineTool("ask_work_iq", {
    description:
      "Query Microsoft 365 data — emails, meetings, calendar events, Teams messages, documents, and people. Ask natural language questions about the user's work data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language query about the user's M365 data",
        },
      },
      required: ["query"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { query } = args as { query: string };
      const q = query.toLowerCase();
      console.log("[mock-workiq] Query:", query);

      const timeScope = parseTimeScope(q);

      // Mock: calendar/meetings
      if (q.includes("calendar") || q.includes("meeting") || q.includes("schedule")) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const sunday = new Date(today);
        sunday.setDate(sunday.getDate() + (7 - sunday.getDay()));

        const meetings = [
          {
            type: "meeting" as const,
            title: "Q4 Planning Review",
            startTime: timeOnDate(today, 14, 0).toISOString(),
            endTime: timeOnDate(today, 15, 0).toISOString(),
            attendees: ["Sarah Chen", "Mike Ross", "Lisa Park"],
            organizer: "Sarah Chen",
            joinUrl: "https://teams.microsoft.com/meet/q4-planning",
            location: "Teams",
          },
          {
            type: "meeting" as const,
            title: "1:1 with Jordan",
            startTime: timeOnDate(today, 15, 30).toISOString(),
            endTime: timeOnDate(today, 16, 0).toISOString(),
            attendees: ["Jordan Williams"],
            organizer: "You",
            joinUrl: "https://teams.microsoft.com/meet/1on1-jordan",
            location: "Teams",
          },
          {
            type: "meeting" as const,
            title: "Sprint Retro",
            startTime: timeOnDate(today, 17, 0).toISOString(),
            endTime: timeOnDate(today, 17, 30).toISOString(),
            attendees: ["Engineering Team"],
            organizer: "Mike Ross",
            joinUrl: "https://teams.microsoft.com/meet/sprint-retro",
            location: "Teams",
          },
          {
            type: "meeting" as const,
            title: "Design Review",
            startTime: timeOnDate(tomorrow, 10, 0).toISOString(),
            endTime: timeOnDate(tomorrow, 11, 0).toISOString(),
            attendees: ["Design Team"],
            organizer: "Lisa Park",
            joinUrl: "https://teams.microsoft.com/meet/design-review",
            location: "Teams",
          },
          {
            type: "meeting" as const,
            title: "Weekend Sync",
            startTime: timeOnDate(sunday, 11, 0).toISOString(),
            endTime: timeOnDate(sunday, 11, 30).toISOString(),
            attendees: ["Sarah Chen"],
            organizer: "You",
            joinUrl: "https://teams.microsoft.com/meet/weekend-sync",
            location: "Teams",
          },
        ];

        const filtered = timeScope
          ? meetings.filter((m) => new Date(m.startTime) >= timeScope)
          : meetings;

        return JSON.stringify({ results: filtered });
      }

      // Mock: emails
      if (q.includes("email") || q.includes("mail") || q.includes("inbox")) {
        const emails = [
          {
            type: "email" as const,
            subject: "Budget approval needed",
            from: "Sarah Chen",
            receivedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
            preview: "Hi, please review and approve the Q4 budget allocation by EOD Friday.",
            isRead: false,
            importance: "high",
          },
          {
            type: "email" as const,
            subject: "Re: Q4 Report Draft",
            from: "Mike Ross",
            receivedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
            preview:
              "Updated the draft with the latest numbers. Let me know if the charts look right.",
            isRead: true,
            importance: "normal",
          },
          {
            type: "email" as const,
            subject: "Team offsite logistics",
            from: "Lisa Park",
            receivedAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
            preview: "Sharing the venue details and agenda for next week's offsite.",
            isRead: true,
            importance: "normal",
          },
        ];

        const filtered = timeScope
          ? emails.filter((e) => new Date(e.receivedAt) >= timeScope)
          : emails;

        return JSON.stringify({ results: filtered });
      }

      // Mock: Teams messages
      if (
        q.includes("teams") ||
        q.includes("message") ||
        q.includes("chat") ||
        q.includes("channel")
      ) {
        const messages = [
          {
            type: "teams_message" as const,
            from: "Jordan Williams",
            channel: "Direct Message",
            sentAt: new Date(Date.now() - 30 * 60_000).toISOString(),
            content: "Are we still on for 3:30?",
          },
          {
            type: "teams_message" as const,
            from: "Mike Ross",
            channel: "Engineering",
            sentAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
            content: "Pushed the hotfix to staging, ready for review.",
          },
          {
            type: "teams_message" as const,
            from: "Sarah Chen",
            channel: "Leadership",
            sentAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
            content: "Reminder: Q4 targets due by Friday.",
          },
        ];

        const filtered = timeScope
          ? messages.filter((m) => new Date(m.sentAt) >= timeScope)
          : messages;

        return JSON.stringify({ results: filtered });
      }

      // Generic fallback
      return JSON.stringify({
        results: [],
        note: "No matching M365 data found for this query. Try asking about calendar, email, or Teams messages.",
      });
    },
  });

  const showNotification = defineTool("show_notification", {
    description: "Show a native OS notification.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title", "body"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { title, body } = args as { title: string; body: string };
      const notification = new Notification({ title, body });
      notification.show();
      return "shown";
    },
  });

  const joinMeeting = defineTool("join_meeting", {
    description: "Open a meeting join URL in the default browser.",
    parameters: {
      type: "object",
      properties: { joinUrl: { type: "string" } },
      required: ["joinUrl"],
    },
    handler: async (args) => {
      await shell.openExternal((args as { joinUrl: string }).joinUrl);
      return "opened";
    },
  });

  const showOverlay = defineTool("show_overlay", {
    description: "Show the Flint overlay window.",
    parameters: {
      type: "object",
      properties: { meetingId: { type: "string" } },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (_args) => {
      callbacks.onShowOverlay();
      return "shown";
    },
  });

  const setAttentionItems = defineTool("set_attention_items", {
    description:
      "Set the items shown in the user's attention panel. Replaces all current items. Use this to surface meetings, messages, emails, or any work items the user should focus on.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              icon: {
                type: "string",
                description: "Lucide icon name: calendar, message-circle, mail, file-text",
              },
              title: { type: "string" },
              description: { type: "string" },
              timestamp: { type: "string", description: "ISO 8601 timestamp for time badge" },
              openAction: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["url"] },
                  url: { type: "string" },
                },
                required: ["type", "url"],
              },
              metadata: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Context injected into chat on selection",
              },
            },
            required: ["id", "icon", "title", "description", "metadata"],
          },
        },
      },
      required: ["items"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { items } = args as { items: AttentionItem[] };
      callbacks.onAttentionUpdate(items);
      return "ok";
    },
  });

  return [askWorkIq, showNotification, joinMeeting, showOverlay, setAttentionItems];
}

export function getMonitorTools(callbacks: Pick<ToolCallbacks, "onAttentionUpdate">): Tool[] {
  const all = createAllTools({
    ...callbacks,
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentional no-op for monitor tools
    onShowOverlay: () => {},
  });
  return all.filter(
    (t) =>
      t.name === "ask_work_iq" ||
      t.name === "set_attention_items" ||
      t.name === "show_notification",
  );
}

export function getChatTools(callbacks: ToolCallbacks): Tool[] {
  return createAllTools(callbacks);
}
