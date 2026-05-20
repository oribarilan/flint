import { Notification } from "electron";
import { defineTool, type Tool } from "@github/copilot-sdk";
import { cachePrepData } from "./prep-cache";

/** Create the tools available to the heartbeat monitor session. */
export function createHeartbeatTools(): Tool[] {
  const cacheMeetingPrep = defineTool("cache_meeting_prep", {
    description: "Save AI-generated prep notes for an upcoming meeting.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID to prep" },
        items: {
          type: "array",
          items: { type: "string" },
          description: "3-5 concise prep bullet points",
        },
      },
      required: ["meetingId", "items"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { meetingId, items } = args as { meetingId: string; items: unknown[] };
      if (!meetingId || !Array.isArray(items)) {
        return "error: invalid arguments";
      }
      // Empty array is valid — signals "prepped but nothing relevant found"
      const capped = items.slice(0, 10).map((s) => (typeof s === "string" ? s.slice(0, 2000) : ""));
      cachePrepData(meetingId, capped);
      console.log(`[heartbeat] Cached ${String(capped.length)} prep items for ${meetingId}`);
      return "cached";
    },
  });

  const showNotification = defineTool("show_notification", {
    description: "Show a native OS notification. Use sparingly — only for time-sensitive items.",
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

  return [cacheMeetingPrep, showNotification];
}
