import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolInvocation } from "@github/copilot-sdk";

vi.mock("electron", () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  shell: { openExternal: vi.fn() },
}));

vi.mock("@github/copilot-sdk", () => ({
  defineTool: (name: string, config: Record<string, unknown>) => ({
    name,
    ...config,
  }),
}));

import { createAllTools, getChatTools } from "../copilot/tools";

const mockInvocation: ToolInvocation = {
  sessionId: "test",
  toolCallId: "tc-1",
  toolName: "",
  arguments: {},
};

describe("Copilot Tools", () => {
  it("creates 4 tools total (ask_work_iq is now via MCP, not custom)", () => {
    const tools = createAllTools({
      onShowOverlay: vi.fn(),
      onAttentionUpdate: vi.fn(),
    });
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "show_notification",
      "join_meeting",
      "show_overlay",
      "set_attention_items",
    ]);
  });

  it("does not expose an ask_work_iq custom tool", () => {
    const tools = createAllTools({
      onShowOverlay: vi.fn(),
      onAttentionUpdate: vi.fn(),
    });
    expect(tools.find((t) => t.name === "ask_work_iq")).toBeUndefined();
  });

  it("set_attention_items calls onAttentionUpdate callback", async () => {
    const onAttentionUpdate = vi.fn();
    const tools = createAllTools({
      onShowOverlay: vi.fn(),
      onAttentionUpdate,
    });
    const setItems = tools.find((t) => t.name === "set_attention_items");
    if (!setItems) throw new Error("set_attention_items not found");
    const items = [
      { id: "1", icon: "calendar", title: "Meeting", description: "Test", metadata: {} },
    ];
    await setItems.handler({ items }, mockInvocation);
    expect(onAttentionUpdate).toHaveBeenCalledWith(items);
  });

  it("show_overlay calls onShowOverlay callback", async () => {
    const onShowOverlay = vi.fn();
    const tools = createAllTools({
      onShowOverlay,
      onAttentionUpdate: vi.fn(),
    });
    const overlay = tools.find((t) => t.name === "show_overlay");
    if (!overlay) throw new Error("show_overlay not found");
    await overlay.handler({ meetingId: "abc" }, mockInvocation);
    expect(onShowOverlay).toHaveBeenCalledWith();
  });

  it("getChatTools returns the same set as createAllTools", () => {
    const tools = getChatTools({ onShowOverlay: vi.fn(), onAttentionUpdate: vi.fn() });
    expect(tools.map((t) => t.name)).toEqual([
      "show_notification",
      "join_meeting",
      "show_overlay",
      "set_attention_items",
    ]);
  });

  describe("join_meeting URL validation", () => {
    function getJoinMeeting() {
      const tools = createAllTools({
        onShowOverlay: vi.fn(),
        onAttentionUpdate: vi.fn(),
      });
      const tool = tools.find((t) => t.name === "join_meeting");
      if (!tool) throw new Error("join_meeting not found");
      return tool;
    }

    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation((): void => undefined);
    });

    it("opens valid https URL", async () => {
      const result = await getJoinMeeting().handler(
        { joinUrl: "https://teams.microsoft.com/meet/abc" },
        mockInvocation,
      );
      expect(result).toBe("opened");
    });

    it("blocks file:// URLs", async () => {
      const result = await getJoinMeeting().handler(
        { joinUrl: "file:///etc/passwd" },
        mockInvocation,
      );
      expect(result).toBe("blocked: non-http scheme: file:");
    });

    it("blocks javascript: URLs", async () => {
      const result = await getJoinMeeting().handler(
        { joinUrl: "javascript:alert(1)" },
        mockInvocation,
      );
      expect(result).toBe("blocked: non-http scheme: javascript:");
    });

    it("blocks malformed URLs", async () => {
      const result = await getJoinMeeting().handler({ joinUrl: "" }, mockInvocation);
      expect(result).toBe("blocked: malformed");
    });
  });
});
