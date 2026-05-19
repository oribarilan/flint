import { Notification } from "electron";
import { defineTool, type Tool } from "@github/copilot-sdk";
import type { AttentionItem, Meeting } from "../types";
import type { FlintBlock } from "../lib/blocks";
import { openExternalUrl } from "../lib/url";
import { AttentionItemSchema } from "../lib/schemas";

interface ToolCallbacks {
  onShowOverlay: () => void;
  onAttentionUpdate: (items: AttentionItem[]) => void;
  onBlocksUpdate: (block: FlintBlock) => void;
  getMeetings: () => Meeting[];
  getPrepData?: (meetingId: string) => string[] | null;
}

export function createAllTools(callbacks: ToolCallbacks): Tool[] {
  // Note: `ask_work_iq` is no longer a custom in-process tool. The chat session now
  // exposes Work IQ tools via the real MCP server (see `sessions.ts` mcpServers).
  // The model calls those tools directly through the MCP boundary; the permission
  // handler approves them as `kind: "mcp"`.

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
    description:
      "Join a meeting by opening its join URL. Use when the user wants to join a meeting.",
    parameters: {
      type: "object",
      properties: { meetingId: { type: "string", description: "The meeting ID to join" } },
      required: ["meetingId"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { meetingId } = args as { meetingId: string };
      const meetings = callbacks.getMeetings();
      const meeting = meetings.find((m) => m.id === meetingId);
      if (!meeting) return "Meeting not found in cache.";
      if (!meeting.joinUrl) return "Meeting has no join URL.";

      callbacks.onBlocksUpdate({
        type: "action-confirmation",
        data: { action: "join_meeting", label: `Joining ${meeting.title}...`, status: "pending" },
      });

      const result = openExternalUrl(meeting.joinUrl);
      if (!result.ok) return `blocked: ${result.reason}`;

      callbacks.onBlocksUpdate({
        type: "action-confirmation",
        data: { action: "join_meeting", label: `Joined ${meeting.title}`, status: "done" },
      });
      return "opened";
    },
  });

  const showMeeting = defineTool("show_meeting", {
    description:
      "Show detailed information about a specific meeting. Use when the user asks about a meeting.",
    parameters: {
      type: "object",
      properties: {
        meetingId: { type: "string", description: "The meeting ID to display" },
      },
      required: ["meetingId"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const { meetingId } = args as { meetingId: string };
      const meetings = callbacks.getMeetings();
      const meeting = meetings.find((m) => m.id === meetingId);
      if (!meeting) return "Meeting not found in cache.";

      const prepItems = callbacks.getPrepData?.(meetingId) ?? undefined;
      const block: FlintBlock = {
        type: "meeting-card",
        data: { ...meeting, ...(prepItems ? { aiPrep: prepItems } : {}) },
      };
      callbacks.onBlocksUpdate(block);
      return `Showing meeting: ${meeting.title}`;
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

  // AttentionStore has a single writer (the chat session) in V1 — full-replace semantics
  // are correct. If a future LLM monitor session is reintroduced (V1.5), revisit with
  // an `owner` field and per-owner replace; for now the simpler model holds.
  // See docs/superpowers/specs/2026-04-30-v1-scope-decision.md.
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
      const rawItems = (args as { items?: unknown }).items;
      if (!Array.isArray(rawItems)) {
        console.warn("[set_attention_items] rejected: items is not an array");
        return "error: invalid items";
      }
      // Per-item validation so the LLM can ship a few good items even if it produces some bad ones.
      const valid: AttentionItem[] = [];
      const dropped: { index: number; issues: unknown }[] = [];
      for (let i = 0; i < rawItems.length; i++) {
        const result = AttentionItemSchema.safeParse(rawItems[i]);
        if (result.success) {
          valid.push(result.data);
        } else {
          dropped.push({ index: i, issues: result.error.issues });
        }
      }
      if (dropped.length > 0) {
        console.warn("[set_attention_items] dropped invalid items", { count: dropped.length });
      }
      if (valid.length === 0 && rawItems.length > 0) {
        console.error("[set_attention_items] all items invalid; not updating store");
        return "error: invalid items";
      }
      callbacks.onAttentionUpdate(valid);
      return "ok";
    },
  });

  return [showNotification, joinMeeting, showMeeting, showOverlay, setAttentionItems];
}

export function getChatTools(callbacks: ToolCallbacks): Tool[] {
  return createAllTools(callbacks);
}
