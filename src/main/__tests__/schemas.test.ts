import { describe, it, expect } from "vitest";
import {
  FlintConfigSchema,
  AttentionItemSchema,
  AttentionItemsArraySchema,
  ChatSendPromptSchema,
} from "../lib/schemas";
import { DEFAULT_CONFIG } from "../types";

describe("FlintConfigSchema", () => {
  it("accepts the default config", () => {
    expect(FlintConfigSchema.parse(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it("accepts a valid partial via .partial()", () => {
    const partial = { alertMinutes: 10, model: "gpt-4.1" };
    expect(FlintConfigSchema.partial().parse(partial)).toEqual(partial);
  });

  it("rejects a string for alertMinutes", () => {
    const result = FlintConfigSchema.partial().safeParse({ alertMinutes: "ten" });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range alertMinutes", () => {
    expect(FlintConfigSchema.partial().safeParse({ alertMinutes: -1 }).success).toBe(false);
    expect(FlintConfigSchema.partial().safeParse({ alertMinutes: 9999 }).success).toBe(false);
  });

  it("rejects an unknown theme value", () => {
    const result = FlintConfigSchema.partial().safeParse({ theme: "neon" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string model", () => {
    const result = FlintConfigSchema.partial().safeParse({ model: 42 });
    expect(result.success).toBe(false);
  });

  it("rejects an empty hotkey", () => {
    const result = FlintConfigSchema.partial().safeParse({ hotkey: "" });
    expect(result.success).toBe(false);
  });
});

describe("AttentionItemSchema", () => {
  const valid = {
    id: "mtg-1",
    icon: "calendar",
    title: "Standup",
    description: "Daily standup",
    metadata: { kind: "meeting" },
  };

  it("parses a minimal valid item", () => {
    expect(AttentionItemSchema.parse(valid)).toEqual(valid);
  });

  it("parses an item with optional fields", () => {
    const full = {
      ...valid,
      timestamp: "2026-04-30T10:00:00Z",
      openAction: { type: "url" as const, url: "https://teams.microsoft.com/x" },
    };
    expect(AttentionItemSchema.parse(full)).toEqual(full);
  });

  it("rejects when id is missing", () => {
    const { id: _id, ...rest } = valid;
    void _id;
    expect(AttentionItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when title is missing", () => {
    const { title: _t, ...rest } = valid;
    void _t;
    expect(AttentionItemSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects when openAction.type is not 'url'", () => {
    const bad = {
      ...valid,
      openAction: { type: "file", url: "https://x.example" },
    };
    expect(AttentionItemSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects when metadata contains non-string values", () => {
    const bad = { ...valid, metadata: { count: 5 as unknown as string } };
    expect(AttentionItemSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(AttentionItemSchema.safeParse({ ...valid, id: "" }).success).toBe(false);
  });

  it("AttentionItemsArraySchema validates an array", () => {
    expect(AttentionItemsArraySchema.parse([valid, valid])).toHaveLength(2);
    expect(AttentionItemsArraySchema.safeParse([valid, { id: "" }]).success).toBe(false);
  });
});

describe("ChatSendPromptSchema", () => {
  it("accepts a normal prompt", () => {
    expect(ChatSendPromptSchema.parse("hello")).toBe("hello");
  });

  it("rejects an empty string", () => {
    expect(ChatSendPromptSchema.safeParse("").success).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(ChatSendPromptSchema.safeParse(123).success).toBe(false);
    expect(ChatSendPromptSchema.safeParse(null).success).toBe(false);
  });

  it("rejects a prompt over 10_000 chars", () => {
    expect(ChatSendPromptSchema.safeParse("x".repeat(10_001)).success).toBe(false);
  });

  it("accepts a prompt at exactly 10_000 chars", () => {
    expect(ChatSendPromptSchema.safeParse("x".repeat(10_000)).success).toBe(true);
  });
});
