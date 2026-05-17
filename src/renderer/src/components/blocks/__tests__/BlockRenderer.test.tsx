// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

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

  it("returns null for meeting-card (not yet implemented)", () => {
    const block: FlintBlock = {
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Test",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
      },
    };
    const { container } = render(<BlockRenderer block={block} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for action-confirmation (not yet implemented)", () => {
    const block: FlintBlock = {
      type: "action-confirmation",
      data: { action: "join", label: "Joining...", status: "pending" },
    };
    const { container } = render(<BlockRenderer block={block} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for chat-message (not yet implemented)", () => {
    const block: FlintBlock = {
      type: "chat-message",
      data: { role: "assistant", content: "Hello" },
    };
    const { container } = render(<BlockRenderer block={block} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null for suggestion-chips (not yet implemented)", () => {
    const block: FlintBlock = {
      type: "suggestion-chips",
      data: [{ label: "Test", prompt: "test" }],
    };
    const { container } = render(<BlockRenderer block={block} />);
    expect(container.innerHTML).toBe("");
  });
});
