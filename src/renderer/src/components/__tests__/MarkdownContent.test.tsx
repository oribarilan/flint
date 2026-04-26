// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { MarkdownContent } from "../MarkdownContent";

// Mock window.flint
const mockOpenLink = vi.fn();
Object.defineProperty(window, "flint", {
  value: { openLink: mockOpenLink },
  writable: true,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MarkdownContent", () => {
  it("renders bold text with accent styling", () => {
    const { container } = render(<MarkdownContent content="This is **bold** text" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("bold");
  });

  it("renders italic text", () => {
    const { container } = render(<MarkdownContent content="This is *italic* text" />);
    const em = container.querySelector("em");
    expect(em).toBeTruthy();
    expect(em?.textContent).toBe("italic");
  });

  it("renders headers", () => {
    const { container } = render(<MarkdownContent content="## My Header" />);
    const h2 = container.querySelector("h2");
    expect(h2).toBeTruthy();
    expect(h2?.textContent).toBe("My Header");
  });

  it("renders code blocks", () => {
    const { container } = render(<MarkdownContent content={"```\nconst x = 1;\n```"} />);
    const pre = container.querySelector("pre");
    const code = container.querySelector("pre code");
    expect(pre).toBeTruthy();
    expect(code).toBeTruthy();
    expect(code?.textContent).toContain("const x = 1;");
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownContent content="Use `npm install` here" />);
    const code = container.querySelector("code");
    expect(code).toBeTruthy();
    expect(code?.textContent).toBe("npm install");
  });

  it("renders links with href", () => {
    const { container } = render(
      <MarkdownContent content="Visit [example](https://example.com)" />,
    );
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.textContent).toBe("example");
  });

  it("renders unordered lists", () => {
    const { container } = render(
      <MarkdownContent content={"- Item one\n- Item two\n- Item three"} />,
    );
    const ul = container.querySelector("ul");
    expect(ul).toBeTruthy();
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(3);
  });

  it("opens links externally via window.flint.openLink", () => {
    const { container } = render(<MarkdownContent content="Click [here](https://example.com)" />);
    const link = container.querySelector("a") as HTMLAnchorElement;
    fireEvent.click(link);
    expect(mockOpenLink).toHaveBeenCalledWith("https://example.com");
  });

  it("prevents default navigation on link click", () => {
    const { container } = render(<MarkdownContent content="Click [here](https://example.com)" />);
    const link = container.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true });
    const preventSpy = vi.spyOn(event, "preventDefault");
    link.dispatchEvent(event);
    expect(preventSpy).toHaveBeenCalled();
  });

  it("wraps content in markdown-styled container", () => {
    const { container } = render(<MarkdownContent content="Hello" />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper?.className).toContain("markdown");
  });
});
