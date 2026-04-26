import { describe, it, expect } from "vitest";
import { CHAT_SYSTEM_PROMPT } from "../copilot/system-prompt";

describe("CHAT_SYSTEM_PROMPT", () => {
  it("contains Work IQ and attention panel instructions", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("Work IQ");
    expect(CHAT_SYSTEM_PROMPT).toContain("set_attention_items");
    expect(CHAT_SYSTEM_PROMPT).toContain("attention panel");
  });

  it("instructs the agent to use markdown formatting", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("markdown");
    expect(CHAT_SYSTEM_PROMPT).toContain("bold");
    expect(CHAT_SYSTEM_PROMPT).toContain("headers");
  });

  it("instructs the agent to never use emojis", () => {
    expect(CHAT_SYSTEM_PROMPT).toMatch(/never use emoji/i);
  });

  it("instructs conciseness", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("concise");
  });
});
