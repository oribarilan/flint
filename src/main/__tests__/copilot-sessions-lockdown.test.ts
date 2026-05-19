import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CopilotClient, CopilotSession } from "@github/copilot-sdk";

const mockSendAndWait = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();
const mockCreateSession = vi.fn().mockImplementation(
  () =>
    ({
      sendAndWait: mockSendAndWait,
      on: mockOn,
      abort: vi.fn(),
      sessionId: "flint-main",
    }) as unknown as CopilotSession,
);

vi.mock("@github/copilot-sdk", () => ({
  approveAll: vi.fn(),
}));

vi.mock("../copilot/permissions", () => ({
  createPermissionPolicy: vi.fn(() => vi.fn()),
}));

vi.mock("../copilot/system-prompt", () => ({
  CHAT_SYSTEM_PROMPT: "system",
  buildChatSystemPrompt: () => "system",
}));

import { createSessionManager } from "../copilot/sessions";

const EXPECTED_CHAT_TOOLS = [
  "show_notification",
  "join_meeting",
  "show_meeting",
  "show_overlay",
  "set_attention_items",
];

const FORBIDDEN_BUILTIN_TOOLS = [
  "bash",
  "shell",
  "read_file",
  "write_file",
  "edit_file",
  "git_status",
  "git_commit",
];

function createMockClient(): CopilotClient {
  return {
    createSession: mockCreateSession,
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as CopilotClient;
}

function makeManager() {
  return createSessionManager({
    client: createMockClient(),
    getModel: () => "gpt-4.1",
    onChatDelta: vi.fn(),
    onChatDone: vi.fn(),
  });
}

describe("SDK perimeter — availableTools allow-list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chat session restricts SDK tools to the Flint custom set (ask_work_iq removed; now via MCP)", async () => {
    const manager = makeManager();
    await manager.sendChatMessage("hi");

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    const args = mockCreateSession.mock.calls[0][0] as { availableTools?: string[] };
    expect(args.availableTools).toEqual(EXPECTED_CHAT_TOOLS);
    expect(args.availableTools).not.toContain("ask_work_iq");
  });

  it("chat allow-list does not contain dangerous built-in tools", async () => {
    const manager = makeManager();
    await manager.sendChatMessage("hi");
    const args = mockCreateSession.mock.calls[0][0] as { availableTools?: string[] };
    for (const forbidden of FORBIDDEN_BUILTIN_TOOLS) {
      expect(args.availableTools).not.toContain(forbidden);
    }
  });

  it("chat session uses the Flint permission policy, not approveAll", async () => {
    const manager = makeManager();
    await manager.sendChatMessage("hi");
    const args = mockCreateSession.mock.calls[0][0] as { onPermissionRequest?: unknown };
    expect(typeof args.onPermissionRequest).toBe("function");
    // The permission policy mock returns a fresh fn — not the approveAll mock.
    const { approveAll } = await import("@github/copilot-sdk");
    expect(args.onPermissionRequest).not.toBe(approveAll);
  });
});
