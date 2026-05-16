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
    const autoApprove = ["set_attention_items", "show_overlay", "show_notification"];

    for (const name of autoApprove) {
      it(`approves ${name}`, async () => {
        const policy = createPermissionPolicy();
        const result = await policy(customToolRequest(name, {}), { sessionId: "test" });
        expect(result).toEqual({ kind: "approved" });
      });
    }
  });

  describe("join_meeting URL gating", () => {
    it("approves an allowlisted Teams URL", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", {
          joinUrl: "https://teams.microsoft.com/meet/abc",
        }),
        { sessionId: "test" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("approves a subdomain of an allowlisted host", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", {
          joinUrl: "https://gov.teams.microsoft.com/meet/abc",
        }),
        { sessionId: "test" },
      );
      expect(result).toEqual({ kind: "approved" });
    });

    it("approves zoom.us, meet.google.com, teams.live.com", async () => {
      const policy = createPermissionPolicy();
      for (const host of ["zoom.us", "meet.google.com", "teams.live.com"]) {
        const result = await policy(
          customToolRequest("join_meeting", { joinUrl: `https://${host}/x` }),
          { sessionId: "test" },
        );
        expect(result).toEqual({ kind: "approved" });
      }
    });

    it("denies a non-allowlisted host", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", { joinUrl: "https://evil.example/phish" }),
        { sessionId: "test" },
      );
      expect(result).not.toEqual({ kind: "approved" });
      expect(warnSpy).toHaveBeenCalledWith(
        "[permissions] denied join_meeting: host not allowed",
        expect.objectContaining({ host: "evil.example" }),
      );
    });

    it("denies a host that merely contains an allowlisted suffix without dot boundary", async () => {
      // `notteams.microsoft.com` ends with `teams.microsoft.com` but not with `.teams.microsoft.com`
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", { joinUrl: "https://evilteams.microsoft.com/x" }),
        { sessionId: "test" },
      );
      // evilteams.microsoft.com endsWith .microsoft.com? no. endsWith .teams.microsoft.com? no.
      // So should be denied.
      expect(result).not.toEqual({ kind: "approved" });
    });

    it("denies a malformed URL", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", { joinUrl: "not a url" }),
        { sessionId: "test" },
      );
      expect(result).not.toEqual({ kind: "approved" });
    });

    it("denies a non-http scheme", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", { joinUrl: "javascript:alert(1)" }),
        { sessionId: "test" },
      );
      expect(result).not.toEqual({ kind: "approved" });
    });

    it("denies a file:// scheme", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", { joinUrl: "file:///etc/passwd" }),
        { sessionId: "test" },
      );
      expect(result).not.toEqual({ kind: "approved" });
    });

    it("denies when joinUrl is missing", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(customToolRequest("join_meeting", {}), { sessionId: "test" });
      expect(result).not.toEqual({ kind: "approved" });
    });

    it("denies when joinUrl is not a string", async () => {
      const policy = createPermissionPolicy();
      const result = await policy(
        customToolRequest("join_meeting", { joinUrl: 42 as unknown as string }),
        { sessionId: "test" },
      );
      expect(result).not.toEqual({ kind: "approved" });
    });
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
    expect(evaluateCustomTool("set_attention_items", {})).toEqual({ kind: "approved" });
  });

  it("denies unknown tool", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = evaluateCustomTool("mystery", {});
    expect(result).not.toEqual({ kind: "approved" });
    spy.mockRestore();
  });
});
