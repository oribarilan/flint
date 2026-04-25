import { describe, it, expect, vi } from "vitest";

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

import { createAllTools, getMonitorTools, getChatTools } from "../copilot/tools";

const mockInvocation = {
  sessionId: "test",
  toolCallId: "tc-1",
  toolName: "",
  arguments: {},
} as any;

describe("Copilot Tools", () => {
  it("creates 5 tools total", () => {
    const tools = createAllTools({
      onShowOverlay: vi.fn(),
      onAttentionUpdate: vi.fn(),
    });
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "ask_work_iq",
      "show_notification",
      "join_meeting",
      "show_overlay",
      "set_attention_items",
    ]);
  });

  it("set_attention_items calls onAttentionUpdate callback", async () => {
    const onAttentionUpdate = vi.fn();
    const tools = createAllTools({
      onShowOverlay: vi.fn(),
      onAttentionUpdate,
    });
    const setItems = tools.find((t) => t.name === "set_attention_items")!;
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
    const overlay = tools.find((t) => t.name === "show_overlay")!;
    await overlay.handler({ meetingId: "abc" }, mockInvocation);
    expect(onShowOverlay).toHaveBeenCalledWith("abc");
  });

  it("getMonitorTools returns ask_work_iq, set_attention_items, show_notification", () => {
    const tools = getMonitorTools({ onAttentionUpdate: vi.fn() });
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name).sort()).toEqual([
      "ask_work_iq",
      "set_attention_items",
      "show_notification",
    ]);
  });

  it("getChatTools returns all tools", () => {
    const tools = getChatTools({ onShowOverlay: vi.fn(), onAttentionUpdate: vi.fn() });
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "ask_work_iq",
      "show_notification",
      "join_meeting",
      "show_overlay",
      "set_attention_items",
    ]);
  });
});
