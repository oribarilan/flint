// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

type StatusCallback = (status: string) => void;

let registeredCallback: StatusCallback | null = null;
const mockUnsubscribe = vi.fn();
const mockOnConnectionStatus = vi.fn((cb: StatusCallback) => {
  registeredCallback = cb;
  return mockUnsubscribe;
});

Object.defineProperty(window, "flint", {
  value: {
    platform: "darwin",
    onConnectionStatus: mockOnConnectionStatus,
  },
  writable: true,
});

import { ConnectionDot } from "../ConnectionDot";

beforeEach(() => {
  registeredCallback = null;
  mockOnConnectionStatus.mockClear();
  mockUnsubscribe.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("ConnectionDot", () => {
  it("defaults to reconnecting state before any event", () => {
    render(<ConnectionDot />);
    const dot = screen.getByTestId("connection-dot");
    expect(dot.dataset.status).toBe("reconnecting");
    expect(dot.getAttribute("title")).toBe("Reconnecting…");
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
  });

  it("has accessible role and aria-live", () => {
    render(<ConnectionDot />);
    const dot = screen.getByRole("status");
    expect(dot.getAttribute("aria-live")).toBe("polite");
  });

  it("subscribes to onConnectionStatus on mount", () => {
    render(<ConnectionDot />);
    expect(mockOnConnectionStatus).toHaveBeenCalledTimes(1);
  });

  it("transitions to connected when callback fires 'connected'", () => {
    render(<ConnectionDot />);
    act(() => {
      registeredCallback?.("connected");
    });
    const dot = screen.getByTestId("connection-dot");
    expect(dot.dataset.status).toBe("connected");
    expect(dot.getAttribute("title")).toBe("Connected");
  });

  it("transitions to disconnected when callback fires 'disconnected'", () => {
    render(<ConnectionDot />);
    act(() => {
      registeredCallback?.("disconnected");
    });
    const dot = screen.getByTestId("connection-dot");
    expect(dot.dataset.status).toBe("disconnected");
    expect(dot.getAttribute("title")).toBe("Disconnected — check Copilot CLI");
  });

  it("unsubscribes when unmounted", () => {
    const { unmount } = render(<ConnectionDot />);
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
