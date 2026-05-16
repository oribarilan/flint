import { Notification } from "electron";
import { defineTool, type Tool } from "@github/copilot-sdk";
import type { AttentionItem } from "../types";
import { openExternalUrl } from "../lib/url";
import { AttentionItemSchema } from "../lib/schemas";

interface ToolCallbacks {
  onShowOverlay: () => void;
  onAttentionUpdate: (items: AttentionItem[]) => void;
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
    description: "Open a meeting join URL in the default browser.",
    parameters: {
      type: "object",
      properties: { joinUrl: { type: "string" } },
      required: ["joinUrl"],
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- SDK tool handlers must be async
    handler: async (args) => {
      const result = openExternalUrl((args as { joinUrl: string }).joinUrl);
      if (!result.ok) return `blocked: ${result.reason}`;
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

  return [showNotification, joinMeeting, showOverlay, setAttentionItems];
}

export function getChatTools(callbacks: ToolCallbacks): Tool[] {
  return createAllTools(callbacks);
}
