// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ActionConfirmation } from "../ActionConfirmation";

describe("ActionConfirmation", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders label text", () => {
    render(
      <ActionConfirmation
        data={{ action: "join", label: "Joining...", status: "pending" }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Joining...")).toBeTruthy();
  });

  it("renders spinner for pending status", () => {
    render(
      <ActionConfirmation
        data={{ action: "join", label: "Joining...", status: "pending" }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("spinner-icon")).toBeTruthy();
    expect(screen.queryByTestId("check-icon")).toBeNull();
  });

  it("renders check for done status", () => {
    render(
      <ActionConfirmation
        data={{ action: "join", label: "Joined", status: "done" }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("check-icon")).toBeTruthy();
    expect(screen.queryByTestId("spinner-icon")).toBeNull();
  });

  it("auto-dismiss fires after 3 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <ActionConfirmation
        data={{ action: "join", label: "Joining...", status: "pending" }}
        onDismiss={onDismiss}
      />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("cleans up timer on unmount", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { unmount } = render(
      <ActionConfirmation
        data={{ action: "join", label: "Joining...", status: "pending" }}
        onDismiss={onDismiss}
      />,
    );
    unmount();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
