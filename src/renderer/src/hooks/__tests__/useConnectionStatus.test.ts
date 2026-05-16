// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

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

import { useConnectionStatus } from "../useConnectionStatus";

beforeEach(() => {
  registeredCallback = null;
  mockOnConnectionStatus.mockClear();
  mockUnsubscribe.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("useConnectionStatus", () => {
  it("returns 'reconnecting' as initial value", () => {
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current).toBe("reconnecting");
  });

  it("updates when callback fires", () => {
    const { result } = renderHook(() => useConnectionStatus());
    act(() => {
      registeredCallback?.("connected");
    });
    expect(result.current).toBe("connected");

    act(() => {
      registeredCallback?.("disconnected");
    });
    expect(result.current).toBe("disconnected");
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useConnectionStatus());
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
