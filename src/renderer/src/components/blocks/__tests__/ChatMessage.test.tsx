// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

import { ChatMessage } from "../ChatMessage";

describe("ChatMessage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders markdown content via MarkdownContent", () => {
    render(<ChatMessage content="Hello **world**" />);
    expect(screen.getByTestId("markdown-content")).toBeTruthy();
    expect(screen.getByTestId("markdown-content").textContent).toBe("Hello **world**");
  });

  it("wraps content in a message container", () => {
    render(<ChatMessage content="Test" />);
    expect(screen.getByTestId("chat-message")).toBeTruthy();
  });
});
