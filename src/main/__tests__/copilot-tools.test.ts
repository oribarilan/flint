import { describe, it, expect, vi } from "vitest";
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

import { createAllTools, getMonitorTools, getChatTools, parseTimeScope } from "../copilot/tools";

const mockInvocation: ToolInvocation = {
  sessionId: "test",
  toolCallId: "tc-1",
  toolName: "",
  arguments: {},
};

interface MockMeeting {
  type: "meeting";
  title: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  organizer: string;
  joinUrl: string;
  location: string;
}

interface MockEmail {
  type: "email";
  subject: string;
  from: string;
  receivedAt: string;
  preview: string;
  isRead: boolean;
  importance: string;
}

interface MockTeamsMessage {
  type: "teams_message";
  from: string;
  channel: string;
  sentAt: string;
  content: string;
}

interface MockResult<T> {
  results: T[];
  note?: string;
}

function getAskWorkIq() {
  const tools = createAllTools({
    onShowOverlay: vi.fn(),
    onAttentionUpdate: vi.fn(),
  });
  const tool = tools.find((t) => t.name === "ask_work_iq");
  if (!tool) throw new Error("ask_work_iq not found");
  return tool;
}

async function queryMeetings(query: string): Promise<MockResult<MockMeeting>> {
  const tool = getAskWorkIq();
  return JSON.parse(await tool.handler({ query }, mockInvocation)) as MockResult<MockMeeting>;
}

async function queryEmails(query: string): Promise<MockResult<MockEmail>> {
  const tool = getAskWorkIq();
  return JSON.parse(await tool.handler({ query }, mockInvocation)) as MockResult<MockEmail>;
}

async function queryTeams(query: string): Promise<MockResult<MockTeamsMessage>> {
  const tool = getAskWorkIq();
  return JSON.parse(await tool.handler({ query }, mockInvocation)) as MockResult<MockTeamsMessage>;
}

async function queryFallback(query: string): Promise<MockResult<unknown>> {
  const tool = getAskWorkIq();
  return JSON.parse(await tool.handler({ query }, mockInvocation)) as MockResult<unknown>;
}

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

describe("ask_work_iq mock", () => {
  describe("calendar/meetings route", () => {
    it("returns 5 meetings for calendar queries", async () => {
      const result = await queryMeetings("show my calendar");
      expect(result.results).toHaveLength(5);
      expect(result.results[0].type).toBe("meeting");
      expect(result.results[0].title).toBe("Q4 Planning Review");
    });

    it("has non-cascading meeting times (date mutation bug fix)", async () => {
      const result = await queryMeetings("show my meetings");
      const meetings = result.results;

      // Q4 Planning Review: 14:00–15:00
      const q4Start = new Date(meetings[0].startTime);
      const q4End = new Date(meetings[0].endTime);
      expect(q4Start.getHours()).toBe(14);
      expect(q4Start.getMinutes()).toBe(0);
      expect(q4End.getHours()).toBe(15);
      expect(q4End.getMinutes()).toBe(0);

      // 1:1 with Jordan: 15:30–16:00
      const oneOnOneStart = new Date(meetings[1].startTime);
      const oneOnOneEnd = new Date(meetings[1].endTime);
      expect(oneOnOneStart.getHours()).toBe(15);
      expect(oneOnOneStart.getMinutes()).toBe(30);
      expect(oneOnOneEnd.getHours()).toBe(16);
      expect(oneOnOneEnd.getMinutes()).toBe(0);

      // Sprint Retro: 17:00–17:30
      const retroStart = new Date(meetings[2].startTime);
      const retroEnd = new Date(meetings[2].endTime);
      expect(retroStart.getHours()).toBe(17);
      expect(retroStart.getMinutes()).toBe(0);
      expect(retroEnd.getHours()).toBe(17);
      expect(retroEnd.getMinutes()).toBe(30);

      // Design Review (tomorrow): 10:00–11:00
      const designStart = new Date(meetings[3].startTime);
      const designEnd = new Date(meetings[3].endTime);
      expect(designStart.getHours()).toBe(10);
      expect(designEnd.getHours()).toBe(11);

      // All today's meetings should be on the same date
      expect(q4Start.toDateString()).toBe(oneOnOneStart.toDateString());
      expect(oneOnOneStart.toDateString()).toBe(retroStart.toDateString());
    });

    it("matches on 'schedule' keyword", async () => {
      const result = await queryMeetings("what's on my schedule?");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe("meeting");
    });
  });

  describe("email route", () => {
    it("returns emails for 'email' queries", async () => {
      const result = await queryEmails("show my emails");
      expect(result.results).toHaveLength(3);
      expect(result.results[0].type).toBe("email");
      expect(result.results[0].subject).toBe("Budget approval needed");
      expect(result.results[0].from).toBe("Sarah Chen");
    });

    it("matches on 'mail' keyword", async () => {
      const result = await queryEmails("any new mail?");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe("email");
    });

    it("matches on 'inbox' keyword", async () => {
      const result = await queryEmails("check my inbox");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe("email");
    });
  });

  describe("Teams messages route", () => {
    it("returns Teams messages for 'teams' queries", async () => {
      const result = await queryTeams("show teams messages");
      expect(result.results).toHaveLength(3);
      expect(result.results[0].type).toBe("teams_message");
      expect(result.results[0].from).toBe("Jordan Williams");
    });

    it("matches on 'message' keyword", async () => {
      const result = await queryTeams("any new messages?");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe("teams_message");
    });

    it("matches on 'chat' keyword", async () => {
      const result = await queryTeams("show my chats");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe("teams_message");
    });

    it("matches on 'channel' keyword", async () => {
      const result = await queryTeams("what's new in channels?");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].type).toBe("teams_message");
    });
  });

  describe("fallback", () => {
    it("returns empty results with note for unmatched queries", async () => {
      const result = await queryFallback("what's the weather?");
      expect(result.results).toHaveLength(0);
      expect(result.note).toContain("No matching M365 data");
    });
  });
});

describe("parseTimeScope", () => {
  it("parses 24h time like 'since 10:30'", () => {
    const scope = parseTimeScope("emails since 10:30");
    expect(scope).not.toBeNull();
    expect(scope?.getHours()).toBe(10);
    expect(scope?.getMinutes()).toBe(30);
  });

  it("parses 24h time like 'after 14:00'", () => {
    const scope = parseTimeScope("meetings after 14:00");
    expect(scope).not.toBeNull();
    expect(scope?.getHours()).toBe(14);
    expect(scope?.getMinutes()).toBe(0);
  });

  it("parses 12h time with PM like 'since 2:00 PM'", () => {
    const scope = parseTimeScope("emails since 2:00 PM");
    expect(scope).not.toBeNull();
    expect(scope?.getHours()).toBe(14);
    expect(scope?.getMinutes()).toBe(0);
  });

  it("parses 12h time with AM", () => {
    const scope = parseTimeScope("messages after 9:15 am");
    expect(scope).not.toBeNull();
    expect(scope?.getHours()).toBe(9);
    expect(scope?.getMinutes()).toBe(15);
  });

  it("handles 12:00 PM as noon", () => {
    const scope = parseTimeScope("since 12:00 pm");
    expect(scope).not.toBeNull();
    expect(scope?.getHours()).toBe(12);
  });

  it("handles 12:00 AM as midnight", () => {
    const scope = parseTimeScope("since 12:00 am");
    expect(scope).not.toBeNull();
    expect(scope?.getHours()).toBe(0);
  });

  it("returns null when no time pattern found", () => {
    expect(parseTimeScope("show my emails")).toBeNull();
  });

  it("returns null for queries without since/after prefix", () => {
    expect(parseTimeScope("meeting at 10:30")).toBeNull();
  });
});

describe("ask_work_iq time-scoped queries", () => {
  it("filters emails by time scope", async () => {
    // "since" a time far in the future should return 0 emails
    const result = await queryEmails("emails since 23:59");
    expect(result.results).toHaveLength(0);
  });

  it("returns all emails when time scope is far in the past", async () => {
    const result = await queryEmails("emails since 0:00");
    // At minimum the 2h-ago email should be present (unless test runs at midnight)
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("filters Teams messages by time scope", async () => {
    const result = await queryTeams("teams messages since 23:59");
    expect(result.results).toHaveLength(0);
  });

  it("filters meetings by time scope", async () => {
    // Meetings after 23:59 today — none of our mock meetings start that late
    const result = await queryMeetings("meetings since 23:59");
    // Only tomorrow's and weekend meetings should survive (their dates are > today 23:59)
    const titles = result.results.map((r) => r.title);
    expect(titles).not.toContain("Q4 Planning Review");
    expect(titles).not.toContain("1:1 with Jordan");
    expect(titles).not.toContain("Sprint Retro");
  });

  it("returns all results when time cannot be parsed", async () => {
    const result = await queryEmails("show my emails please");
    expect(result.results).toHaveLength(3);
  });
});
