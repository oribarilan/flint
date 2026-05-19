import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPermissionPolicy, evaluateCustomTool } from "../copilot/permissions";

function customToolRequest(name: string, args?: Record<string, unknown>) {
  return {
    kind: "custom-tool" as const,
    toolName: name,
    toolDescription: "test",
    args,
  };
}

describe("createPermissionPolicy", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("auto-approved custom tools", () => {
    const autoApprove = [
      "set_attention_items",
      "show_overlay",
      "show_notification",
      "show_meeting",
      "join_meeting",
    ];

    for (const name of autoApprove) {
      it(`approves ${name}`, async () => {
        const policy = createPermissionPolicy();
        const result = await policy(customToolRequest(name, {}), { sessionId: "test" });
        expect(result).toEqual({ kind: "approved" });
      });
    }
  });

  describe("unknown tools", () => {
    it("denies an unknown custom tool name", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(customToolRequest("rm_dash_rf", {}), { sessionId: "test" });
      expect(result).not.toEqual({ kind: "approved" });
      expect(warnSpy).toHaveBeenCalledWith(
        "[permissions] denied unknown tool",
        expect.objectContaining({ name: "rm_dash_rf" }),
      );
    });

    it("denies built-in permission kinds (shell/write/read/url)", async () => {
      const policy = createPermissionPolicy();
      for (const kind of ["shell", "write", "read", "url"] as const) {
        const result = await policy(
          { kind, toolCallId: "x" } as unknown as Parameters<typeof policy>[0],
          { sessionId: "test" },
        );
        expect(result).not.toEqual({ kind: "approved" });
      }
    });
  });

  describe("MCP tools (Work IQ)", () => {
    it("approves a Work IQ MCP tool by default", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        {
          kind: "mcp",
          serverName: "work-iq",
          toolName: "search_emails",
          toolTitle: "Search emails",
          readOnly: true,
          args: {},
        } as unknown as Parameters<typeof policy>[0],
        { sessionId: "test" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("denies an MCP tool whose name looks dangerous (defence in depth)", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        {
          kind: "mcp",
          serverName: "work-iq",
          toolName: "execute_bash",
          toolTitle: "shell",
          readOnly: false,
          args: {},
        } as unknown as Parameters<typeof policy>[0],
        { sessionId: "test" },
      );
      expect(result).not.toEqual({ kind: "approved" });
    });
  });
});

describe("evaluateCustomTool (direct)", () => {
  it("approves known auto-approved tool", () => {
    expect(evaluateCustomTool("set_attention_items")).toEqual({ kind: "approved" });
  });

  it("approves show_meeting", () => {
    expect(evaluateCustomTool("show_meeting")).toEqual({ kind: "approved" });
  });

  it("approves join_meeting", () => {
    expect(evaluateCustomTool("join_meeting")).toEqual({ kind: "approved" });
  });

  it("denies unknown tool", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = evaluateCustomTool("mystery");
    expect(result).not.toEqual({ kind: "approved" });
    spy.mockRestore();
  });
});
