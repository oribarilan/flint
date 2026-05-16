import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CopilotClient, CopilotSession } from "@github/copilot-sdk";

const mockSendAndWait = vi.fn().mockResolvedValue(undefined);
const mockAbort = vi.fn().mockResolvedValue(undefined);
type EventHandler = (...args: unknown[]) => void;
const eventHandlers = new Map<string, EventHandler>();
const mockOn = vi.fn((event: string, handler: EventHandler) => {
  eventHandlers.set(event, handler);
});
const mockCreateSession = vi.fn().mockImplementation(() => {
  eventHandlers.clear();
  return {
    sendAndWait: mockSendAndWait,
    on: mockOn,
    abort: mockAbort,
    sessionId: "flint-main",
  } as unknown as CopilotSession;
});

vi.mock("@github/copilot-sdk", () => ({
  approveAll: vi.fn(),
}));

vi.mock("../copilot/permissions", () => ({
  createPermissionPolicy: vi.fn(() => vi.fn()),
}));

vi.mock("../copilot/system-prompt", () => ({
  CHAT_SYSTEM_PROMPT: "You are Flint, a test assistant.",
}));

import { createSessionManager } from "../copilot/sessions";

function createMockClient(): CopilotClient {
  return {
    createSession: mockCreateSession,
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as CopilotClient;
}

function defaultConfig() {
  return {
    getModel: () => "gpt-4.1",
    onChatDelta: vi.fn(),
    onChatDone: vi.fn(),
  };
}

describe("SessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
  });

  it("sends chat message and creates session lazily", async () => {
    const onChatDelta = vi.fn();
    const onChatDone = vi.fn();
    const client = createMockClient();

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatDelta,
      onChatDone,
    });

    await manager.sendChatMessage("hello");

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "flint-main",
        streaming: true,
        systemMessage: {
          content: "You are Flint, a test assistant.",
        },
      }),
    );
    expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: "hello" }, expect.any(Number));
    expect(mockOn).toHaveBeenCalledWith("session.idle", expect.any(Function));
    // Simulate the idle event firing
    eventHandlers.get("session.idle")?.();
    expect(onChatDone).toHaveBeenCalled();
  });

  it("wires Work IQ MCP server on the chat session", async () => {
    const client = createMockClient();
    const manager = createSessionManager({ client, ...defaultConfig() });

    await manager.sendChatMessage("hi");

    const args = mockCreateSession.mock.calls[0][0] as {
      mcpServers?: Record<string, unknown>;
    };
    expect(args.mcpServers).toBeDefined();
    expect(args.mcpServers?.["work-iq"]).toEqual({
      type: "local",
      command: "npx",
      args: ["-y", "@microsoft/workiq", "mcp"],
      tools: ["*"],
    });
  });

  it("uses getModel to read model dynamically", async () => {
    let currentModel = "gpt-4.1";
    const client = createMockClient();

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      getModel: () => currentModel,
    });

    await manager.sendChatMessage("first");

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1",
      }),
    );

    // Change model — won't affect existing session
    currentModel = "claude-sonnet-4";

    // Reset and create new session
    await manager.resetChat();
    mockCreateSession.mockClear();

    await manager.sendChatMessage("second");

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4",
      }),
    );
  });

  it("reuses existing chat session on subsequent calls", async () => {
    const client = createMockClient();
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    });

    await manager.sendChatMessage("first");
    await manager.sendChatMessage("second");

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockSendAndWait).toHaveBeenCalledTimes(2);
  });

  it("registers delta event handler on chat session", async () => {
    const onChatDelta = vi.fn();
    const client = createMockClient();

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatDelta,
    });

    await manager.sendChatMessage("test");

    expect(mockOn).toHaveBeenCalledWith("assistant.message_delta", expect.any(Function));
  });

  it("resetChat aborts and nulls the session", async () => {
    const client = createMockClient();
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    });

    await manager.sendChatMessage("hello");
    expect(manager.getChatSession()).not.toBeNull();

    await manager.resetChat();
    expect(mockAbort).toHaveBeenCalled();
    expect(manager.getChatSession()).toBeNull();
  });

  it("resetChat is safe when no session exists", async () => {
    const client = createMockClient();
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    });

    await expect(manager.resetChat()).resolves.toBeUndefined();
  });

  it("creates fresh session after resetChat", async () => {
    const client = createMockClient();
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    });

    await manager.sendChatMessage("first");
    expect(mockCreateSession).toHaveBeenCalledTimes(1);

    await manager.resetChat();
    await manager.sendChatMessage("second");
    expect(mockCreateSession).toHaveBeenCalledTimes(2);
  });

  it("calls onChatError on send failure", async () => {
    const onChatError = vi.fn();
    const client = createMockClient();
    mockCreateSession.mockRejectedValueOnce(new Error("session creation failed"));

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatError,
    });

    await manager.sendChatMessage("fail");
    expect(onChatError).toHaveBeenCalledWith("Chat error: session creation failed");
  });

  it("reports timeout errors distinctly", async () => {
    const onChatError = vi.fn();
    const client = createMockClient();
    mockSendAndWait.mockRejectedValueOnce(new Error("Request timeout"));

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatError,
    });

    await manager.sendChatMessage("slow");
    expect(onChatError).toHaveBeenCalledWith("Response timed out. Try again.");
  });

  it("surfaces a setup hint when Work IQ MCP fails", async () => {
    const onChatError = vi.fn();
    const client = createMockClient();
    mockCreateSession.mockRejectedValueOnce(
      new Error("failed to start workiq mcp subprocess"),
    );

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatError,
    });

    await manager.sendChatMessage("hi");
    expect(onChatError).toHaveBeenCalledWith(
      "M365 not connected — run `workiq accept-eula` to set up.",
    );
  });

  it("getChatSession returns null before first message", () => {
    const client = createMockClient();
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    });
    expect(manager.getChatSession()).toBeNull();
  });
});
