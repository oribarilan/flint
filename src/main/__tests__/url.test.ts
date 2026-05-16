import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  shell: { openExternal: vi.fn() },
}));

import { shell } from "electron";
import { openExternalUrl, parseHost } from "../lib/url";

// eslint-disable-next-line @typescript-eslint/unbound-method -- vi.mocked needs the bare reference
const openExternal = vi.mocked(shell.openExternal);

const noop = (): void => undefined;

describe("openExternalUrl", () => {
  beforeEach(() => {
    openExternal.mockReset();
    openExternal.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  describe("valid URLs", () => {
    it("opens http URLs", () => {
      const result = openExternalUrl("http://example.com");
      expect(result).toEqual({ ok: true });
      expect(openExternal).toHaveBeenCalledWith("http://example.com");
    });

    it("opens https URLs", () => {
      const result = openExternalUrl("https://example.com");
      expect(result).toEqual({ ok: true });
      expect(openExternal).toHaveBeenCalledWith("https://example.com");
    });

    it("opens https URLs with port, path, query", () => {
      const url = "https://example.com:8080/path?query=1";
      const result = openExternalUrl(url);
      expect(result).toEqual({ ok: true });
      expect(openExternal).toHaveBeenCalledWith(url);
    });
  });

  describe("rejected schemes", () => {
    it.each([
      ["javascript:alert(1)", "non-http scheme: javascript:"],
      ["file:///etc/passwd", "non-http scheme: file:"],
      ["data:text/html,<script>alert(1)</script>", "non-http scheme: data:"],
      ["mailto:foo@bar.com", "non-http scheme: mailto:"],
    ])("rejects %s", (url, reason) => {
      const result = openExternalUrl(url);
      expect(result).toEqual({ ok: false, reason });
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("malformed URLs", () => {
    it("rejects empty string as malformed", () => {
      const result = openExternalUrl("");
      expect(result).toEqual({ ok: false, reason: "malformed" });
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("rejects 'not a url' as whitespace (whitespace check runs first)", () => {
      // "not a url" contains spaces — caught by whitespace check
      const result = openExternalUrl("not a url");
      expect(result).toEqual({ ok: false, reason: "whitespace in URL" });
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("rejects non-URL string without spaces as malformed", () => {
      const result = openExternalUrl("notaurl");
      expect(result).toEqual({ ok: false, reason: "malformed" });
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("embedded credentials", () => {
    it("rejects URL with user:pass@host", () => {
      const result = openExternalUrl("https://user:pass@example.com");
      expect(result).toEqual({ ok: false, reason: "embedded credentials" });
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("rejects URL with username only", () => {
      const result = openExternalUrl("https://user@example.com");
      expect(result).toEqual({ ok: false, reason: "embedded credentials" });
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("whitespace", () => {
    it("rejects URL containing space", () => {
      const result = openExternalUrl("https://example.com /path");
      expect(result).toEqual({ ok: false, reason: "whitespace in URL" });
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("rejects URL containing tab", () => {
      const result = openExternalUrl("https://example.com\t/path");
      expect(result).toEqual({ ok: false, reason: "whitespace in URL" });
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("logging", () => {
    it("logs structured warning without full URL on rejection", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(noop);
      openExternalUrl("javascript:alert(1)");
      expect(warn).toHaveBeenCalledWith(
        "[url] blocked open:",
        "non-http scheme: javascript:",
        "host:",
        expect.any(String),
      );
      // Ensure full URL not in any call argument
      const allArgs = warn.mock.calls.flat().join(" ");
      expect(allArgs).not.toContain("alert(1)");
    });

    it("does not log credentials in warning", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(noop);
      openExternalUrl("https://user:pass@example.com");
      const allArgs = warn.mock.calls.flat().join(" ");
      expect(allArgs).not.toContain("pass");
      expect(allArgs).not.toContain("user:");
    });
  });
});

describe("parseHost", () => {
  it("returns lowercased hostname", () => {
    expect(parseHost("https://Example.COM/path")).toBe("example.com");
  });

  it("returns null for malformed URL", () => {
    expect(parseHost("not-a-url")).toBeNull();
  });

  it("returns hostname for http URL with port", () => {
    expect(parseHost("http://example.com:8080")).toBe("example.com");
  });

  it("returns null for empty string", () => {
    expect(parseHost("")).toBeNull();
  });
});
