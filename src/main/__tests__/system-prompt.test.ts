import { describe, it, expect } from "vitest";
import { CHAT_SYSTEM_PROMPT, loadPrompt } from "../copilot/system-prompt";

describe("CHAT_SYSTEM_PROMPT", () => {
  describe("structural sections", () => {
    it("has a # Role section", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/^# Role$/m);
    });

    it("has a # Tools available section", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/^# Tools available$/m);
    });

    it("has a # When to use the attention panel section", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/^# When to use the attention panel$/m);
    });

    it("has an # Attention item shape section", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/^# Attention item shape$/m);
    });

    it("has an # Output format section", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/^# Output format$/m);
    });

    it("has a # Constraints section", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/^# Constraints$/m);
    });
  });

  describe("tool surface", () => {
    it("mentions Work IQ as the M365 data source", () => {
      expect(CHAT_SYSTEM_PROMPT).toContain("Work IQ");
    });

    it("mentions set_attention_items by name", () => {
      expect(CHAT_SYSTEM_PROMPT).toContain("set_attention_items");
    });

    it("explicitly disclaims tools that are not available", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/do not have a shell|don't have a shell/i);
      expect(CHAT_SYSTEM_PROMPT).toMatch(/Do not claim to/i);
    });
  });

  describe("attention item shape", () => {
    it("lists every required field", () => {
      for (const field of ["id", "icon", "title", "description"]) {
        expect(CHAT_SYSTEM_PROMPT).toMatch(new RegExp(`\`${field}\``));
      }
    });

    it("lists the allowed Lucide icon names", () => {
      for (const icon of ["calendar", "message-circle", "mail", "file-text"]) {
        expect(CHAT_SYSTEM_PROMPT).toContain(icon);
      }
    });

    it("documents the openAction shape", () => {
      expect(CHAT_SYSTEM_PROMPT).toContain("openAction");
      expect(CHAT_SYSTEM_PROMPT).toMatch(/type:\s*"url"/);
    });
  });

  describe("constraints", () => {
    it("forbids markdown tables", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/never use markdown tables/i);
    });

    it("forbids emojis", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/never use emojis/i);
    });

    it("instructs conciseness", () => {
      expect(CHAT_SYSTEM_PROMPT.toLowerCase()).toContain("concise");
    });

    it("instructs markdown formatting for output", () => {
      expect(CHAT_SYSTEM_PROMPT).toMatch(/markdown/i);
      expect(CHAT_SYSTEM_PROMPT.toLowerCase()).toContain("bold");
    });
  });

  describe("loader hygiene", () => {
    it("returns a non-empty string for the chat prompt", () => {
      expect(loadPrompt("chat").length).toBeGreaterThan(100);
    });

    it("CHAT_SYSTEM_PROMPT equals loadPrompt('chat')", () => {
      expect(CHAT_SYSTEM_PROMPT).toBe(loadPrompt("chat"));
    });
  });
});
