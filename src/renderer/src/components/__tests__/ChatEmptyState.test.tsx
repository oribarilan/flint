// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ChatEmptyState, getGreeting } from "../ChatEmptyState";
import { STATIC_SUGGESTIONS } from "../../utils/suggestions";

vi.mock("../../stores/attentionStore", () => ({
  useAttentionStore: vi.fn((selector: unknown) => {
    const state = { items: [] };
    return typeof selector === "function"
      ? (selector as (s: typeof state) => unknown)(state)
      : state;
  }),
}));

afterEach(cleanup);

describe("ChatEmptyState", () => {
  it("renders greeting and subtitle", () => {
    render(<ChatEmptyState onSend={vi.fn()} />);

    expect(screen.getByRole("heading", { level: 2 })).toBeTruthy();
    expect(
      screen.getByText("I can help you stay on top of your day. Try asking about:"),
    ).toBeTruthy();
  });

  it("renders all four suggestion cards as buttons", () => {
    render(<ChatEmptyState onSend={vi.fn()} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(screen.getByText("What are my next meetings?")).toBeTruthy();
    expect(screen.getByText("Prepare me for my next meeting")).toBeTruthy();
    expect(screen.getByText("Any conflicts this week?")).toBeTruthy();
    expect(screen.getByText("Summarize today's schedule")).toBeTruthy();
  });

  it("renders descriptions for each card", () => {
    render(<ChatEmptyState onSend={vi.fn()} />);

    expect(screen.getByText("See upcoming meetings, times, and attendees")).toBeTruthy();
    expect(screen.getByText("Get agenda, attendee context, and talking points")).toBeTruthy();
    expect(screen.getByText("Find overlapping or back-to-back meetings")).toBeTruthy();
    expect(screen.getByText("Quick overview of your day at a glance")).toBeTruthy();
  });

  it("calls onSend with the card title when a suggestion is clicked", () => {
    const onSend = vi.fn();
    render(<ChatEmptyState onSend={onSend} />);

    fireEvent.click(screen.getByText("What are my next meetings?"));
    expect(onSend).toHaveBeenCalledWith("What are my next meetings?");

    fireEvent.click(screen.getByText("Summarize today's schedule"));
    expect(onSend).toHaveBeenCalledWith("Summarize today's schedule");

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it("exports STATIC_SUGGESTIONS from suggestions utility", () => {
    expect(STATIC_SUGGESTIONS).toHaveLength(4);
    expect(STATIC_SUGGESTIONS[0].title).toBe("What are my next meetings?");
  });
});

describe("getGreeting", () => {
  it('returns "Good morning" for hours 0–11', () => {
    expect(getGreeting(0)).toBe("Good morning");
    expect(getGreeting(6)).toBe("Good morning");
    expect(getGreeting(11)).toBe("Good morning");
  });

  it('returns "Good afternoon" for hours 12–17', () => {
    expect(getGreeting(12)).toBe("Good afternoon");
    expect(getGreeting(15)).toBe("Good afternoon");
    expect(getGreeting(17)).toBe("Good afternoon");
  });

  it('returns "Good evening" for hours 18–23', () => {
    expect(getGreeting(18)).toBe("Good evening");
    expect(getGreeting(21)).toBe("Good evening");
    expect(getGreeting(23)).toBe("Good evening");
  });
});
