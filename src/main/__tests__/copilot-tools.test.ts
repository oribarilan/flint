import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolInvocation } from "@github/copilot-sdk";
import type { Meeting } from "../types";

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

function makeCallbacks(overrides: Partial<Parameters<typeof createAllTools>[0]> = {}) {
  return {
    onShowOverlay: vi.fn(),
    onAttentionUpdate: vi.fn(),
    onBlocksUpdate: vi.fn(),
    getMeetings: vi.fn<() => Meeting[]>().mockReturnValue([]),
    ...overrides,
  };
}

const testMeeting: Meeting = {
  id: "m1",
  title: "Q4 Planning",
  startTime: "2026-05-18T14:00:00Z",
  endTime: "2026-05-18T15:00:00Z",
  attendees: ["Bob", "Carol"],
  organizer: "Alice",
  joinUrl: "https://teams.microsoft.com/meet/abc",
  agenda: "Review goals",
};

describe("Copilot Tools", () => {
  it("creates 5 tools", () => {
    const tools = createAllTools(makeCallbacks());
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "show_notification",
      "join_meeting",
      "show_meeting",
      "show_overlay",
      "set_attention_items",
    ]);
  });

  it("does not expose an ask_work_iq custom tool", () => {
    const tools = createAllTools(makeCallbacks());
    expect(tools.find((t) => t.name === "ask_work_iq")).toBeUndefined();
  });

  it("set_attention_items calls onAttentionUpdate callback", async () => {
    const cbs = makeCallbacks();
    const tools = createAllTools(cbs);
    const setItems = tools.find((t) => t.name === "set_attention_items");
    if (!setItems) throw new Error("set_attention_items not found");
    const items = [
      { id: "1", icon: "calendar", title: "Meeting", description: "Test", metadata: {} },
    ];
    await setItems.handler({ items }, mockInvocation);
    expect(cbs.onAttentionUpdate).toHaveBeenCalledWith(items);
  });

  it("show_overlay calls onShowOverlay callback", async () => {
    const cbs = makeCallbacks();
    const tools = createAllTools(cbs);
    const overlay = tools.find((t) => t.name === "show_overlay");
    if (!overlay) throw new Error("show_overlay not found");
    await overlay.handler({ meetingId: "abc" }, mockInvocation);
    expect(cbs.onShowOverlay).toHaveBeenCalledWith();
  });

  it("getChatTools returns the same set as createAllTools", () => {
    const tools = getChatTools(makeCallbacks());
    expect(tools.map((t) => t.name)).toEqual([
      "show_notification",
      "join_meeting",
      "show_meeting",
      "show_overlay",
      "set_attention_items",
    ]);
  });

  describe("show_meeting", () => {
    function getShowMeeting(cbs = makeCallbacks()) {
      const tools = createAllTools(cbs);
      const tool = tools.find((t) => t.name === "show_meeting");
      if (!tool) throw new Error("show_meeting not found");
      return { tool, cbs };
    }

    it("emits a meeting-card block for a valid meeting", async () => {
      const cbs = makeCallbacks({ getMeetings: vi.fn().mockReturnValue([testMeeting]) });
      const { tool } = getShowMeeting(cbs);
      const result = await tool.handler({ meetingId: "m1" }, mockInvocation);
      expect(result).toBe("Showing meeting: Q4 Planning");
      expect(cbs.onBlocksUpdate).toHaveBeenCalledWith({
        type: "meeting-card",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ id: "m1", title: "Q4 Planning" }),
      });
    });

    it("returns error for missing meeting", async () => {
      const { tool, cbs } = getShowMeeting();
      const result = await tool.handler({ meetingId: "nonexistent" }, mockInvocation);
      expect(result).toBe("Meeting not found in cache.");
      expect(cbs.onBlocksUpdate).not.toHaveBeenCalled();
    });
  });

  describe("join_meeting", () => {
    function getJoinMeeting(cbs = makeCallbacks()) {
      const tools = createAllTools(cbs);
      const tool = tools.find((t) => t.name === "join_meeting");
      if (!tool) throw new Error("join_meeting not found");
      return { tool, cbs };
    }

    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation((): void => undefined);
    });

    it("emits action-confirmation blocks and opens URL for valid meeting", async () => {
      const cbs = makeCallbacks({ getMeetings: vi.fn().mockReturnValue([testMeeting]) });
      const { tool } = getJoinMeeting(cbs);
      const result = await tool.handler({ meetingId: "m1" }, mockInvocation);
      expect(result).toBe("opened");
      expect(cbs.onBlocksUpdate).toHaveBeenCalledTimes(2);
      expect(cbs.onBlocksUpdate).toHaveBeenNthCalledWith(1, {
        type: "action-confirmation",
        data: { action: "join_meeting", label: "Joining Q4 Planning...", status: "pending" },
      });
      expect(cbs.onBlocksUpdate).toHaveBeenNthCalledWith(2, {
        type: "action-confirmation",
        data: { action: "join_meeting", label: "Joined Q4 Planning", status: "done" },
      });
    });

    it("returns error for missing meeting", async () => {
      const { tool, cbs } = getJoinMeeting();
      const result = await tool.handler({ meetingId: "nonexistent" }, mockInvocation);
      expect(result).toBe("Meeting not found in cache.");
      expect(cbs.onBlocksUpdate).not.toHaveBeenCalled();
    });

    it("returns error for meeting with no join URL", async () => {
      const noUrlMeeting = { ...testMeeting, joinUrl: undefined };
      const cbs = makeCallbacks({ getMeetings: vi.fn().mockReturnValue([noUrlMeeting]) });
      const { tool } = getJoinMeeting(cbs);
      const result = await tool.handler({ meetingId: "m1" }, mockInvocation);
      expect(result).toBe("Meeting has no join URL.");
    });
  });
});
