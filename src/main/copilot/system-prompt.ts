import chatPromptRaw from "./prompts/chat.md?raw";

/**
 * Registry of all loaded system prompts. Single source of truth.
 * Add new prompts here as `.md` files in `./prompts/` and re-export below.
 */
const PROMPTS = {
  chat: chatPromptRaw,
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
