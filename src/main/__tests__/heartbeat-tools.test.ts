import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  Notification: vi.fn().mockImplementation((opts: { title: string; body: string }) => ({
    title: opts.title,
    body: opts.body,
    show: vi.fn(),
  })),
}));

import { createHeartbeatTools } from "../heartbeat/tools";
import { getPrepData, clearPrepData } from "../heartbeat/prep-cache";

function findTool(name: string) {
  const tools = createHeartbeatTools();
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}

describe("heartbeat tools", () => {
  beforeEach(() => {
    clearPrepData();
  });

  describe("cache_meeting_prep", () => {
    it("caches prep items for a meeting", async () => {
      const tool = findTool("cache_meeting_prep");
      const result = await tool.handler({ meetingId: "m1", items: ["bullet 1", "bullet 2"] });
      expect(result).toBe("cached");
      expect(getPrepData("m1")).toEqual(["bullet 1", "bullet 2"]);
    });

    it("caps items at 10", async () => {
      const tool = findTool("cache_meeting_prep");
      const items = Array.from({ length: 15 }, (_, i) => `item ${String(i)}`);
      await tool.handler({ meetingId: "m1", items });
      expect(getPrepData("m1")).toHaveLength(10);
    });

    it("accepts empty items to signal nothing found", async () => {
      const tool = findTool("cache_meeting_prep");
      const result = await tool.handler({ meetingId: "m1", items: [] });
      expect(result).toBe("cached");
      expect(getPrepData("m1")).toEqual([]);
    });

    it("rejects missing meetingId", async () => {
      const tool = findTool("cache_meeting_prep");
      const result = await tool.handler({ meetingId: "", items: ["a"] });
      expect(result).toBe("error: invalid arguments");
    });
  });

  describe("show_notification", () => {
    it("creates and shows a notification", async () => {
      const tool = findTool("show_notification");
      const result = await tool.handler({ title: "Flint", body: "test" });
      expect(result).toBe("shown");
    });
  });
});
