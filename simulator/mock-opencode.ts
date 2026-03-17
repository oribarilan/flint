/**
 * Mock OpenCode handlers — used in test mode for deterministic behavior.
 *
 * Simulates chat streaming, model listing, and provider auth without
 * requiring a real OpenCode server.
 */

import type { SimState, EmitFn, CommandHandlerMap } from "./types";

// ---------------------------------------------------------------------------
// Mock chat streaming
// ---------------------------------------------------------------------------

let streamTimer: ReturnType<typeof setInterval> | null = null;

function simulateChatResponse(message: string, state: SimState, emit: EmitFn): void {
  state.isStreaming = true;
  const lower = message.toLowerCase();

  if (lower.includes("file") || lower.includes("code") || lower.includes("edit")) {
    setTimeout(() => emit("chat:tool_start", "file_search"), 200);
    setTimeout(() => emit("chat:tool_end", "file_search"), 1500);
    if (lower.includes("edit")) {
      setTimeout(() => {
        emit("chat:tool_start", "file_edit");
        setTimeout(() => emit("chat:tool_end", "file_edit"), 1200);
      }, 1800);
    }
  }

  if (lower.includes("mcp") || lower.includes("github")) {
    setTimeout(() => emit("chat:tool_start", "mcp_github_search_repos"), 200);
    setTimeout(() => emit("chat:tool_end", "mcp_github_search_repos"), 2000);
  }

  const response = generateMockResponse(message);
  const words = response.split(" ");
  let index = 0;
  const startDelay = lower.includes("file") || lower.includes("mcp") ? 2500 : 300;

  setTimeout(() => {
    streamTimer = setInterval(() => {
      if (index < words.length) {
        const token = (index === 0 ? "" : " ") + words[index];
        emit("chat:token", token);
        index++;
      } else {
        if (streamTimer) clearInterval(streamTimer);
        streamTimer = null;
        emit("chat:done", null);
        state.isStreaming = false;
      }
    }, 50);
  }, startDelay);
}

function generateMockResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi")) {
    return "Hello! I'm the Flint simulator. I can help you test the UI.\n\nTry asking me about **code**, `files`, or your second brain.";
  }
  if (lower.includes("search") || lower.includes("find")) {
    return "I found several relevant notes in your second brain:\n\n- **Project ideas** — brainstorm notes from last week\n- **Rust learning** — notes on ownership and borrowing\n- **Meeting notes** — Q2 planning session\n\nWould you like me to open any of these?";
  }
  if (lower.includes("code") || lower.includes("rust")) {
    return 'Here\'s an example from your notes:\n\n```rust\nfn main() {\n    let greeting = "Hello, second brain!";\n    println!("{greeting}");\n}\n```\n\nThis is from your `rust-learning/basics.md` file.';
  }
  if (lower.includes("help")) {
    return "I can help you **capture** and **retrieve** information from your second brain.\n\n- Type a question to search your notes\n- Use `Tab` to switch between search and chat\n- Select a model from the dropdown above";
  }
  return `You said: *"${message}"*. This is a simulated response. In production, this would come from **OpenCode** connected to your second brain.`;
}

// ---------------------------------------------------------------------------
// Mock models
// ---------------------------------------------------------------------------

const MOCK_MODELS = [
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider_id: "anthropic",
    provider_name: "Anthropic",
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider_id: "anthropic",
    provider_name: "Anthropic",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider_id: "anthropic",
    provider_name: "Anthropic",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider_id: "anthropic",
    provider_name: "Anthropic",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider_id: "anthropic",
    provider_name: "Anthropic",
  },
  { id: "openai/o3", name: "o3", provider_id: "openai", provider_name: "OpenAI" },
  { id: "openai/gpt-5.4", name: "GPT-5.4", provider_id: "openai", provider_name: "OpenAI" },
  { id: "openai/gpt-5.2", name: "GPT-5.2", provider_id: "openai", provider_name: "OpenAI" },
  { id: "openai/gpt-4.1", name: "GPT-4.1", provider_id: "openai", provider_name: "OpenAI" },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider_id: "openai",
    provider_name: "OpenAI",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider_id: "google",
    provider_name: "Google",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider_id: "google",
    provider_name: "Google",
  },
];

const MOCK_DEFAULT_MODEL = "anthropic/claude-sonnet-4";

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createMockOpenCodeHandlers(state: SimState, emit: EmitFn): CommandHandlerMap {
  return {
    get_chat_status: () => structuredClone(state.chatStatus),

    send_chat_message: (args) => {
      const msg = (args?.message as string) ?? "";
      const pid = (args?.providerId as string) ?? null;
      const mid = (args?.modelId as string) ?? null;
      console.log(`[sim] send_chat_message: ${msg} (model: ${pid}/${mid})`);
      simulateChatResponse(msg, state, emit);
    },

    get_available_models: () => [MOCK_MODELS, MOCK_DEFAULT_MODEL],

    abort_chat: () => {
      if (streamTimer) {
        clearInterval(streamTimer);
        streamTimer = null;
      }
      state.isStreaming = false;
    },

    clear_chat: () => {},

    init_opencode: () => {
      state.chatStatus = {
        connected: true,
        session_id: "sim-session-001",
        repo_path: state.config.second_brain.repo_path,
      };
    },

    get_provider_auth: () => [
      { id: "github-copilot", name: "GitHub Copilot", connected: state.providerConnected },
      { id: "opencode", name: "OpenCode Zen", connected: true },
    ],

    start_provider_auth: (args) => {
      const pid = (args?.providerId as string) ?? "unknown";
      console.log(`[sim] start_provider_auth: ${pid}`);
      setTimeout(() => {
        state.providerConnected = true;
      }, 1000);
      return {
        url: `https://opencode.ai/auth?provider=${pid}`,
        method: "auto",
        instructions: `Opening browser for ${pid} authentication...`,
      };
    },

    complete_provider_auth: (args) => {
      const pid = (args?.providerId as string) ?? "unknown";
      console.log(`[sim] complete_provider_auth: ${pid}`);
      state.providerConnected = true;
    },

    check_provider_connected: () => state.providerConnected,
  };
}
