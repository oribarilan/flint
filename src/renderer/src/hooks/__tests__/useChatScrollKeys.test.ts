// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { RefObject } from "react";

import { useChatScrollKeys } from "../useChatScrollKeys";

function pressCtrl(key: string): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

function makeChatPanelRef(scrollBy = vi.fn(), clientHeight = 400) {
  return {
    current: { clientHeight, scrollBy } as unknown as HTMLDivElement,
  } satisfies RefObject<HTMLDivElement | null>;
}

function mockMatchMedia(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockReturnValue({ matches: reduced }),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useChatScrollKeys", () => {
  it("Ctrl+D scrolls down by half clientHeight (smooth by default)", () => {
    const scrollBy = vi.fn();
    mockMatchMedia(false);
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef: makeChatPanelRef(scrollBy), hasMessages: true });
    });

    act(() => {
      pressCtrl("d");
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 200, behavior: "smooth" });
  });

  it("Ctrl+U scrolls up by half clientHeight", () => {
    const scrollBy = vi.fn();
    mockMatchMedia(false);
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef: makeChatPanelRef(scrollBy), hasMessages: true });
    });

    act(() => {
      pressCtrl("u");
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: -200, behavior: "smooth" });
  });

  it("uses instant scroll when prefers-reduced-motion is set", () => {
    const scrollBy = vi.fn();
    mockMatchMedia(true);
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef: makeChatPanelRef(scrollBy), hasMessages: true });
    });

    act(() => {
      pressCtrl("d");
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 200, behavior: "instant" });
  });

  it("is a no-op when chat is empty", () => {
    const scrollBy = vi.fn();
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef: makeChatPanelRef(scrollBy), hasMessages: false });
    });

    act(() => {
      pressCtrl("d");
    });
    act(() => {
      pressCtrl("u");
    });

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("is a no-op when disabled", () => {
    const scrollBy = vi.fn();
    renderHook(() => {
      useChatScrollKeys({
        chatPanelRef: makeChatPanelRef(scrollBy),
        hasMessages: true,
        disabled: true,
      });
    });

    act(() => {
      pressCtrl("d");
    });

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("is a no-op when chatPanelRef is null", () => {
    const chatPanelRef: RefObject<HTMLDivElement | null> = { current: null };
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef, hasMessages: true });
    });

    // Should not throw
    act(() => {
      pressCtrl("d");
    });
  });

  it("ignores Ctrl+D/U with metaKey also pressed", () => {
    const scrollBy = vi.fn();
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef: makeChatPanelRef(scrollBy), hasMessages: true });
    });

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "d",
          ctrlKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("calls preventDefault and stopPropagation", () => {
    const scrollBy = vi.fn();
    mockMatchMedia(false);
    renderHook(() => {
      useChatScrollKeys({ chatPanelRef: makeChatPanelRef(scrollBy), hasMessages: true });
    });

    const event = new KeyboardEvent("keydown", {
      key: "d",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(event, "preventDefault");
    const stopSpy = vi.spyOn(event, "stopPropagation");

    act(() => {
      document.dispatchEvent(event);
    });

    expect(preventSpy).toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalled();
  });
});
