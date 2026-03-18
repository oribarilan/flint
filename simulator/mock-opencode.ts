/**
 * Mock OpenCode handlers — used in test mode for deterministic behavior.
 *
 * Simulates chat streaming and model listing without requiring a real
 * OpenCode server.
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
    return "Hello! I'm your **Second Brain Doctor**. I can help you search, organize, and improve your notes.\n\nTry asking me about your projects, learning progress, or notes that need attention.";
  }

  if (lower.includes("work") && lower.includes("week")) {
    return "Based on your recent notes, here's what you worked on this week:\n\n## Projects\n- **Flint App** — implemented kit system, fixed search ranking\n- **Vault Setup** — reorganized PARA structure, added AGENTS.md\n\n## Notes Modified\n- `01_projects/flint/architecture.md` — updated IPC design\n- `02_areas/engineering/rust-patterns.md` — added error handling notes\n- `03_resources/tools/opencode.md` — new file\n\n> 💡 Consider adding a weekly summary note to capture these insights.";
  }

  if (lower.includes("incomplete") || lower.includes("updating") || lower.includes("need")) {
    return "I found **3 notes** that could use attention:\n\n1. **`02_areas/health/workout-routine.md`** — last updated 3 months ago, contains TODO items\n2. **`01_projects/blog/draft-ai-tools.md`** — marked as draft, 60% complete\n3. **`03_resources/books/atomic-habits.md`** — has placeholder sections\n\n### Suggestions\n- Archive the workout routine if it's no longer relevant\n- Set a deadline for the blog draft\n- Fill in the book notes while the content is fresh";
  }

  if (lower.includes("project") && lower.includes("status")) {
    return "## Active Projects\n\n| Project | Status | Last Activity |\n|---------|--------|---------------|\n| Flint App | 🟢 Active | Today |\n| Blog | 🟡 Stalled | 2 weeks ago |\n| Vault Setup | ✅ Complete | 3 days ago |\n\n---\n\n**Flint App** has the most activity. Your blog project hasn't been touched in a while — would you like me to surface your draft notes?";
  }

  if (lower.includes("learning") || lower.includes("progress")) {
    return "## Your Learning Tracks\n\n- **Rust** — 12 notes across basics, ownership, async, and error handling\n- **AI/ML** — 5 notes on prompt engineering, RAG, and embeddings\n- **Design** — 3 notes on typography, color theory\n\n### Recent Additions\n- `rust-patterns.md` — error handling with `thiserror` vs `anyhow`\n- `prompt-engineering.md` — chain-of-thought techniques\n\n> You're building strong foundations in Rust. Consider creating a *spaced repetition* note to review key concepts.";
  }

  if (lower.includes("search") || lower.includes("find")) {
    return "I found several relevant notes in your second brain:\n\n- **Project ideas** — brainstorm notes from last week\n- **Rust learning** — notes on ownership and borrowing\n- **Meeting notes** — Q2 planning session\n\nWould you like me to open any of these?";
  }

  if (lower.includes("code") || lower.includes("rust")) {
    return 'Here\'s an example from your notes:\n\n```rust\nfn main() {\n    let greeting = "Hello, second brain!";\n    println!("{greeting}");\n}\n```\n\nThis is from your `rust-learning/basics.md` file.';
  }

  if (lower.includes("help")) {
    return "I can help you **capture** and **retrieve** information from your second brain.\n\n- Ask about your projects, learning, or notes\n- Request a health check on your vault organization\n- Find incomplete or stale notes\n- Get summaries of any topic in your notes\n\nYour second brain uses the **PARA method**:\n1. **Projects** — active work with deadlines\n2. **Areas** — ongoing responsibilities\n3. **Resources** — reference material\n4. **Archive** — completed or inactive items";
  }

  return `You asked: *"${message}"*\n\nI searched your second brain but didn't find a direct match. Try being more specific, or I can help you **create a new note** on this topic.`;
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

    get_available_models: () => [MOCK_MODELS, state.projectModelConfig.model ?? MOCK_DEFAULT_MODEL],

    get_project_model_config_status: () => structuredClone(state.projectModelConfig),

    set_project_default_model: (args) => {
      const model = ((args?.model as string) ?? "").trim();
      if (!model) return;
      state.projectModelConfig.exists = true;
      state.projectModelConfig.has_model = true;
      state.projectModelConfig.model = model;
      if (!state.projectModelConfig.path) {
        state.projectModelConfig.path = `${state.chatStatus.repo_path ?? "/mock/second-brain"}/opencode.jsonc`;
      }
    },

    abort_chat: () => {
      if (streamTimer) {
        clearInterval(streamTimer);
        streamTimer = null;
      }
      state.isStreaming = false;
    },

    clear_chat: () => {},

    get_session_messages: () => {
      // In test mode, return empty history (fresh session).
      return [];
    },

    init_opencode: () => {
      state.chatStatus = {
        connected: true,
        session_id: "sim-session-001",
        repo_path: state.config.second_brain.repo_path,
      };
    },
  };
}
