import type { CopilotSession, Tool } from "@github/copilot-sdk";
import type { CopilotClient } from "@github/copilot-sdk";
import { CHAT_SYSTEM_PROMPT } from "./system-prompt";
import { createPermissionPolicy } from "./permissions";

/**
 * SDK allow-list of tools the chat session may invoke. Required because `tools[]` in
 * `createSession` is *additive*, not replacing — without `availableTools` the SDK
 * exposes its built-in tools (bash/shell/read_file/write_file/git*) which combined
 * with auto-approve permissions is a prompt-injection RCE class of bug.
 *
 * Note on MCP tools: per SDK docs the allow-list semantics are ambiguous. In practice
 * MCP-server-exposed tools (e.g. work-iq) are namespaced separately and routed via the
 * permission handler (`kind: "mcp"`), not through this list. If dogfooding shows MCP
 * tools being filtered, add their (prefixed) names here or switch to `excludedTools`.
 *
 * See: docs/superpowers/specs/2026-04-30-v1-scope-decision.md
 *      node_modules/@github/copilot-sdk/dist/types.d.ts (SessionConfig.availableTools)
 */
const CHAT_AVAILABLE_TOOLS = [
  "show_notification",
  "join_meeting",
  "show_overlay",
  "set_attention_items",
] as const;

const CHAT_TIMEOUT_MS = 60_000; // 60s timeout for chat

interface SessionManagerConfig {
  client: CopilotClient;
  getModel: () => string;
  chatTools?: Tool[];
  onChatDelta: (delta: string) => void;
  onChatDone: () => void;
  onChatError?: (error: string) => void;
}

export interface SessionManager {
  sendChatMessage(prompt: string): Promise<void>;
  resetChat(): Promise<void>;
  getChatSession(): CopilotSession | null;
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  let chatSession: CopilotSession | null = null;

  function reportError(message: string): void {
    console.error("[sessions]", message);
    if (config.onChatError) {
      config.onChatError(message);
    } else {
      // Fallback: send error as a delta so user sees it
      config.onChatDelta(`\n\n⚠️ ${message}`);
      config.onChatDone();
    }
  }

  async function ensureChatSession(): Promise<CopilotSession> {
    if (chatSession) return chatSession;

    const model = config.getModel();
    console.log("[sessions] Creating chat session with model:", model);

    // Decisions documented (see V1 scope decision doc):
    //
    // 1) Single NL `ask_work_iq` tool vs narrow typed tools:
    //    For V1, take whatever Work IQ MCP exposes natively (`tools: ["*"]`). Don't wrap
    //    in narrower tools. If after dogfooding the model struggles to compose good
    //    queries, V1.5 can add narrow wrappers.
    //
    // 2) One MCP server vs two:
    //    Monitor session is gone in V1 (deterministic MeetingScheduler replaces it).
    //    Single Work IQ subprocess attached to the chat session only.
    //
    // 3) `tools: ["*"]` exposes all Work IQ MCP tools to the model. The permission
    //    handler (`createPermissionPolicy`) approves these as `kind: "mcp"` because
    //    Work IQ is read-only M365 data access. Defence in depth: dangerous-looking
    //    tool names (bash/shell/exec/read_file/write_file/git) are denied even from MCP.
    chatSession = await config.client.createSession({
      sessionId: "flint-main",
      model,
      onPermissionRequest: createPermissionPolicy(),
      streaming: true,
      systemMessage: {
        content: CHAT_SYSTEM_PROMPT,
      },
      tools: config.chatTools,
      availableTools: [...CHAT_AVAILABLE_TOOLS],
      mcpServers: {
        "work-iq": {
          type: "local",
          command: "npx",
          args: ["-y", "@microsoft/workiq", "mcp"],
          tools: ["*"],
        },
      },
    });
    console.log("[sessions] Chat session created:", chatSession.sessionId);

    chatSession.on("assistant.message_delta", (event) => {
      config.onChatDelta(event.data.deltaContent);
    });

    chatSession.on("session.idle", () => {
      config.onChatDone();
    });

    return chatSession;
  }

  return {
    async sendChatMessage(prompt: string): Promise<void> {
      try {
        const session = await ensureChatSession();
        console.log("[chat] Sending:", prompt);
        await session.sendAndWait({ prompt }, CHAT_TIMEOUT_MS);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[chat] sendAndWait error:", message);
        // Best-effort empty-state messaging when Work IQ MCP fails to start.
        // If the SDK surfaces a clean MCP-error event in the future, hook there instead.
        const lower = message.toLowerCase();
        if (lower.includes("workiq") || lower.includes("work-iq") || lower.includes("mcp")) {
          reportError("M365 not connected — run `workiq accept-eula` to set up.");
        } else if (lower.includes("timeout")) {
          reportError("Response timed out. Try again.");
        } else {
          reportError(`Chat error: ${message}`);
        }
      }
    },

    async resetChat(): Promise<void> {
      if (chatSession) {
        try {
          await chatSession.abort();
        } catch {
          // session may not have an active request
        }
        chatSession = null;
        console.log("[sessions] Chat session reset");
      }
    },

    getChatSession(): CopilotSession | null {
      return chatSession;
    },
  };
}
