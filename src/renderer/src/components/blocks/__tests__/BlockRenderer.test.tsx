// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../MeetingRow", () => ({
  MeetingRow: ({ meeting }: { meeting: { id: string } }) => (
    <div data-testid={`meeting-row-${meeting.id}`}>MeetingRow</div>
  ),
}));

vi.mock("../../AttentionRow", () => ({
  AttentionRow: ({ item }: { item: { id: string } }) => (
    <div data-testid={`attention-row-${item.id}`}>AttentionRow</div>
  ),
}));

vi.mock("../../MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

import { BlockRenderer } from "../BlockRenderer";
import type { FlintBlock } from "../../../../../main/lib/blocks";

describe("BlockRenderer", () => {
  it("renders MeetingList for meeting-list block", () => {
    const block: FlintBlock = {
      type: "meeting-list",
      data: [
        {
          id: "m1",
          title: "Standup",
          startTime: "2026-05-18T10:00:00Z",
          endTime: "2026-05-18T10:30:00Z",
          attendees: [],
          organizer: "Alice",
        },
      ],
    };
    const { getByTestId } = render(<BlockRenderer block={block} />);
    expect(getByTestId("meeting-row-m1")).toBeTruthy();
  });

  it("renders AttentionList for attention-list block", () => {
    Object.defineProperty(window, "flint", {
      value: { openAttentionItem: vi.fn() },
      writable: true,
    });

    const block: FlintBlock = {
      type: "attention-list",
      data: [
        {
          id: "a1",
          icon: "mail",
          title: "Reply",
          description: "From Alice",
          metadata: { kind: "email" },
        },
      ],
    };
    const { getByTestId } = render(<BlockRenderer block={block} />);
    expect(getByTestId("attention-row-a1")).toBeTruthy();
  });

  it("renders MeetingCard for meeting-card block", () => {
    const block: FlintBlock = {
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Test Meeting",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
      },
    };
    render(<BlockRenderer block={block} />);
    expect(screen.getByTestId("meeting-card")).toBeTruthy();
    expect(screen.getByText("Test Meeting")).toBeTruthy();
  });

  it("renders ActionConfirmation when onDismiss is provided", () => {
    const block: FlintBlock = {
      type: "action-confirmation",
      data: { action: "join", label: "Joining...", status: "pending" },
    };
    render(<BlockRenderer block={block} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("action-confirmation")).toBeTruthy();
    expect(screen.getByText("Joining...")).toBeTruthy();
  });

  it("returns null for action-confirmation without onDismiss", () => {
    const block: FlintBlock = {
      type: "action-confirmation",
      data: { action: "join", label: "Joining...", status: "pending" },
    };
    const { container } = render(<BlockRenderer block={block} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders ChatMessage for chat-message block", () => {
    const block: FlintBlock = {
      type: "chat-message",
      data: { role: "assistant", content: "Hello" },
    };
    render(<BlockRenderer block={block} />);
    expect(screen.getByTestId("chat-message")).toBeTruthy();
    expect(screen.getByTestId("markdown-content").textContent).toBe("Hello");
  });

  it("returns null for suggestion-chips (rendered separately)", () => {
    const block: FlintBlock = {
      type: "suggestion-chips",
      data: [{ label: "Test", prompt: "test" }],
    };
    const { container } = render(<BlockRenderer block={block} />);
    expect(container.innerHTML).toBe("");
  });
});
