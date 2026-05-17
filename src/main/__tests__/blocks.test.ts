import { describe, it, expect } from "vitest";
import {
  derivePillState,
  FlintBlockSchema,
  BlocksActionSchema,
  MeetingCardDataSchema,
  ActionConfirmDataSchema,
  SuggestionChipSchema,
  ChatMessageDataSchema,
} from "../lib/blocks";
import type { FlintBlock } from "../lib/blocks";

// ── derivePillState ──

describe("derivePillState", () => {
  it("returns briefing when no block and not streaming", () => {
    expect(derivePillState(null, false)).toBe("briefing");
  });

  it("returns chat when no block and streaming", () => {
    expect(derivePillState(null, true)).toBe("chat");
  });

  it("returns meeting-focus for meeting-card block", () => {
    const block: FlintBlock = {
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Standup",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
      },
    };
    expect(derivePillState(block, false)).toBe("meeting-focus");
  });

  it("returns action-confirm for action-confirmation block", () => {
    const block: FlintBlock = {
      type: "action-confirmation",
      data: { action: "join_meeting", label: "Joining...", status: "pending" },
    };
    expect(derivePillState(block, false)).toBe("action-confirm");
  });

  it("returns chat for chat-message block", () => {
    const block: FlintBlock = {
      type: "chat-message",
      data: { role: "assistant", content: "Hello" },
    };
    expect(derivePillState(block, false)).toBe("chat");
  });

  it("returns briefing for meeting-list block", () => {
    const block: FlintBlock = { type: "meeting-list", data: [] };
    expect(derivePillState(block, false)).toBe("briefing");
  });

  it("returns briefing for attention-list block", () => {
    const block: FlintBlock = { type: "attention-list", data: [] };
    expect(derivePillState(block, false)).toBe("briefing");
  });

  it("returns briefing for suggestion-chips block", () => {
    const block: FlintBlock = { type: "suggestion-chips", data: [] };
    expect(derivePillState(block, false)).toBe("briefing");
  });

  it("returns meeting-focus even when streaming with meeting-card", () => {
    const block: FlintBlock = {
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Standup",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
      },
    };
    expect(derivePillState(block, true)).toBe("meeting-focus");
  });
});

// ── FlintBlockSchema ──

describe("FlintBlockSchema", () => {
  it("accepts a valid meeting-list block", () => {
    const block = {
      type: "meeting-list",
      data: [
        {
          id: "m1",
          title: "Standup",
          startTime: "2026-05-18T10:00:00Z",
          endTime: "2026-05-18T10:30:00Z",
          attendees: ["Bob"],
          organizer: "Alice",
        },
      ],
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(true);
  });

  it("accepts a valid meeting-card block", () => {
    const block = {
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Planning",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
        joinUrl: "https://teams.example.com/join",
        aiPrep: ["Review Q4 roadmap"],
      },
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(true);
  });

  it("accepts a valid attention-list block", () => {
    const block = {
      type: "attention-list",
      data: [
        {
          id: "a1",
          icon: "mail",
          title: "Reply to email",
          description: "From Alice",
          metadata: { kind: "email" },
        },
      ],
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(true);
  });

  it("accepts a valid action-confirmation block", () => {
    const block = {
      type: "action-confirmation",
      data: { action: "join_meeting", label: "Joining Q4 Planning...", status: "pending" },
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(true);
  });

  it("accepts a valid chat-message block", () => {
    const block = {
      type: "chat-message",
      data: { role: "assistant", content: "Here are your meetings." },
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(true);
  });

  it("accepts a valid suggestion-chips block", () => {
    const block = {
      type: "suggestion-chips",
      data: [{ label: "What's next?", prompt: "What's next on my calendar?" }],
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(true);
  });

  it("rejects unknown block type", () => {
    const block = { type: "unknown", data: {} };
    expect(FlintBlockSchema.safeParse(block).success).toBe(false);
  });

  it("rejects meeting-card with missing required fields", () => {
    const block = {
      type: "meeting-card",
      data: { id: "m1" }, // missing title, startTime, etc.
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(false);
  });

  it("rejects chat-message with wrong role", () => {
    const block = {
      type: "chat-message",
      data: { role: "user", content: "hello" },
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(false);
  });

  it("rejects action-confirmation with invalid status", () => {
    const block = {
      type: "action-confirmation",
      data: { action: "join", label: "Joining...", status: "running" },
    };
    expect(FlintBlockSchema.safeParse(block).success).toBe(false);
  });

  it("rejects block without data field", () => {
    const block = { type: "meeting-list" };
    expect(FlintBlockSchema.safeParse(block).success).toBe(false);
  });
});

// ── Individual schemas ──

describe("MeetingCardDataSchema", () => {
  it("rejects empty id", () => {
    const data = {
      id: "",
      title: "Test",
      startTime: "2026-05-18T10:00:00Z",
      endTime: "2026-05-18T10:30:00Z",
      attendees: [],
      organizer: "Alice",
    };
    expect(MeetingCardDataSchema.safeParse(data).success).toBe(false);
  });
});

describe("ActionConfirmDataSchema", () => {
  it("accepts valid data", () => {
    expect(
      ActionConfirmDataSchema.safeParse({
        action: "join",
        label: "Joining...",
        status: "done",
      }).success,
    ).toBe(true);
  });
});

describe("SuggestionChipSchema", () => {
  it("rejects empty label", () => {
    expect(SuggestionChipSchema.safeParse({ label: "", prompt: "hi" }).success).toBe(false);
  });
});

describe("ChatMessageDataSchema", () => {
  it("rejects empty content", () => {
    expect(ChatMessageDataSchema.safeParse({ role: "assistant", content: "" }).success).toBe(false);
  });
});

// ── BlocksActionSchema ──

describe("BlocksActionSchema", () => {
  it("accepts a valid join action", () => {
    const action = { type: "join", payload: { meetingId: "m1" } };
    expect(BlocksActionSchema.safeParse(action).success).toBe(true);
  });

  it("accepts a valid dismiss action", () => {
    const action = { type: "dismiss", payload: {} };
    expect(BlocksActionSchema.safeParse(action).success).toBe(true);
  });

  it("accepts a valid open action", () => {
    const action = { type: "open", payload: { url: "https://example.com" } };
    expect(BlocksActionSchema.safeParse(action).success).toBe(true);
  });

  it("rejects unknown action type", () => {
    const action = { type: "delete", payload: {} };
    expect(BlocksActionSchema.safeParse(action).success).toBe(false);
  });

  it("rejects missing payload", () => {
    const action = { type: "join" };
    expect(BlocksActionSchema.safeParse(action).success).toBe(false);
  });

  it("rejects non-string payload values", () => {
    const action = { type: "join", payload: { meetingId: 123 } };
    expect(BlocksActionSchema.safeParse(action).success).toBe(false);
  });
});
