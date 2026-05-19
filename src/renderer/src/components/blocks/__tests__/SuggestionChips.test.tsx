// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { SuggestionChips } from "../SuggestionChips";

afterEach(cleanup);

describe("SuggestionChips", () => {
  it("renders chips for briefing state", () => {
    render(<SuggestionChips pillState="briefing" onSend={vi.fn()} />);
    expect(screen.getByText("What's next?")).toBeTruthy();
    expect(screen.getByText("Prep for next meeting")).toBeTruthy();
  });

  it("renders chips for meeting-focus state", () => {
    render(<SuggestionChips pillState="meeting-focus" onSend={vi.fn()} />);
    expect(screen.getByText("Join")).toBeTruthy();
    expect(screen.getByText("Prep notes")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
  });

  it("renders nothing for chat state", () => {
    const { container } = render(<SuggestionChips pillState="chat" onSend={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for action-confirm state", () => {
    const { container } = render(<SuggestionChips pillState="action-confirm" onSend={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("calls onSend with chip prompt when clicked", () => {
    const onSend = vi.fn();
    render(<SuggestionChips pillState="briefing" onSend={onSend} />);

    fireEvent.click(screen.getByText("What's next?"));
    expect(onSend).toHaveBeenCalledWith("What's next on my calendar?");
  });

  it("calls onBack when Back chip is clicked", () => {
    const onBack = vi.fn();
    render(<SuggestionChips pillState="meeting-focus" onSend={vi.fn()} onBack={onBack} />);

    fireEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("does not call onSend for __action: prefixed prompts", () => {
    const onSend = vi.fn();
    const onJoin = vi.fn();
    render(<SuggestionChips pillState="meeting-focus" onSend={onSend} onJoin={onJoin} />);

    fireEvent.click(screen.getByText("Join"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("calls onJoin when Join chip is clicked", () => {
    const onJoin = vi.fn();
    render(<SuggestionChips pillState="meeting-focus" onSend={vi.fn()} onJoin={onJoin} />);

    fireEvent.click(screen.getByText("Join"));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("has accessible group role", () => {
    render(<SuggestionChips pillState="briefing" onSend={vi.fn()} />);
    expect(screen.getByRole("group")).toBeTruthy();
  });
});
