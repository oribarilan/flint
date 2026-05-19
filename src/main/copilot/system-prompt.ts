import chatPromptRaw from "./prompts/chat.md?raw";
import heartbeatPromptRaw from "./prompts/heartbeat.md?raw";
import type { Meeting } from "../types";

/**
 * Registry of all loaded system prompts. Single source of truth.
 * Add new prompts here as `.md` files in `./prompts/` and re-export below.
 */
const PROMPTS = {
  chat: chatPromptRaw,
  heartbeat: heartbeatPromptRaw,
} as const;

export type PromptName = keyof typeof PROMPTS;

/** Load a system prompt by name. Throws if the prompt body is empty. */
export function loadPrompt(name: PromptName): string {
  const body = PROMPTS[name];
  if (!body || body.trim().length === 0) {
    throw new Error(`[prompts] Prompt "${name}" is empty or missing`);
  }
  return body;
}

/** Public re-export for the chat session's system message. */
export const CHAT_SYSTEM_PROMPT = loadPrompt("chat");

/** Build a chat system prompt with current meeting context injected. */
export function buildChatSystemPrompt(meetings: Meeting[]): string {
  const base = loadPrompt("chat");
  if (meetings.length === 0) return base;

  const context = meetings
    .map((m) => {
      const start = new Date(m.startTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      const end = new Date(m.endTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      return `- ID: "${m.id}" | "${m.title}" | ${start} - ${end}`;
    })
    .join("\n");

  return `${base}\n\n# Current meetings\n\n${context}`;
}
