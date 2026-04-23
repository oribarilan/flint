import { describe, it, expect } from "vitest";

// We test the internal parsing functions by importing the module.
// Since renderMarkdown returns ReactNodes, we'll test it via string output.

// Inline test of the markdown module's behavior by rendering to string
import { renderMarkdown } from "../markdown";
import { renderToStaticMarkup } from "react-dom/server";

function md(input: string): string {
  const node = renderMarkdown(input);
  return renderToStaticMarkup(node as React.ReactElement);
}

describe("markdown parser", () => {
  // ── Paragraphs ──────────────────────────────────────────────

  it("renders plain text as a paragraph", () => {
    const html = md("Hello world");
    expect(html).toContain("<p");
    expect(html).toContain("Hello world");
  });

  it("splits double newlines into separate paragraphs", () => {
    const html = md("First paragraph\n\nSecond paragraph");
    expect(html).toContain("First paragraph");
    expect(html).toContain("Second paragraph");
    // Should have two <p> elements
    const pCount = (html.match(/<p /g) ?? []).length;
    expect(pCount).toBe(2);
  });

  // ── Code blocks ─────────────────────────────────────────────

  it("renders fenced code blocks", () => {
    const html = md("```\nconst x = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("renders code blocks with language annotation", () => {
    const html = md("```rust\nfn main() {}\n```");
    expect(html).toContain("language-rust");
    expect(html).toContain("fn main() {}");
  });

  it("handles code blocks with surrounding text", () => {
    const html = md("Before\n\n```js\ncode\n```\n\nAfter");
    expect(html).toContain("Before");
    expect(html).toContain("<pre");
    expect(html).toContain("code");
    expect(html).toContain("After");
  });

  it("handles unclosed code blocks gracefully", () => {
    const html = md("```\nunclosed code");
    expect(html).toContain("<pre");
    expect(html).toContain("unclosed code");
  });

  // ── Inline formatting ───────────────────────────────────────

  it("renders inline code with backticks", () => {
    const html = md("Use `npm install` to install");
    expect(html).toContain("<code");
    expect(html).toContain("npm install");
    expect(html).toContain("to install");
  });

  it("renders bold text", () => {
    const html = md("This is **bold** text");
    expect(html).toContain("<strong");
    expect(html).toContain("bold");
  });

  it("renders italic text", () => {
    const html = md("This is *italic* text");
    expect(html).toContain("<em");
    expect(html).toContain("italic");
  });

  it("renders links", () => {
    const html = md("Visit [example](https://example.com) now");
    expect(html).toContain("<a");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("example");
    expect(html).toContain('target="_blank"');
  });

  it("renders mixed inline formatting", () => {
    const html = md("Use **bold** and `code` and *italic* together");
    expect(html).toContain("<strong");
    expect(html).toContain("<code");
    expect(html).toContain("<em");
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("handles empty string", () => {
    const html = md("");
    expect(html).toBeDefined();
  });

  it("handles text with no formatting", () => {
    const html = md("Just plain text with no formatting at all");
    expect(html).toContain("Just plain text");
  });

  it("preserves text outside of formatting markers", () => {
    const html = md("before `code` after");
    expect(html).toContain("before ");
    expect(html).toContain(" after");
  });
});
