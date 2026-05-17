// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../AttentionRow", () => ({
  AttentionRow: ({ item }: { item: { id: string } }) => (
    <div data-testid={`attention-row-${item.id}`}>AttentionRow</div>
  ),
}));

import { AttentionList } from "../AttentionList";
import type { AttentionItem } from "../../../../../main/types";

describe("AttentionList", () => {
  beforeAll(() => {
    Object.defineProperty(window, "flint", {
      value: { openAttentionItem: vi.fn() },
      writable: true,
    });
  });

  const items: AttentionItem[] = [
    {
      id: "a1",
      icon: "mail",
      title: "Reply to email",
      description: "From Alice",
      metadata: { kind: "email" },
    },
    {
      id: "a2",
      icon: "calendar",
      title: "RSVP",
      description: "Team lunch",
      metadata: { kind: "meeting" },
    },
  ];

  it("renders an AttentionRow for each item", () => {
    const { getByTestId } = render(<AttentionList items={items} />);
    expect(getByTestId("attention-row-a1")).toBeTruthy();
    expect(getByTestId("attention-row-a2")).toBeTruthy();
  });

  it("renders nothing for empty array", () => {
    const { container } = render(<AttentionList items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
