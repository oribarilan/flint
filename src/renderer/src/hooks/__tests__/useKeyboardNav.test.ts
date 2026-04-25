// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { AttentionItem } from "../../../../main/types";
import type { Suggestion } from "../../utils/suggestions";

import { useKeyboardNav } from "../useKeyboardNav";

const TEST_SUGGESTIONS: Suggestion[] = [
  { icon: "calendar", title: "What are my next meetings?", description: "desc1" },
  { icon: "clipboard-list", title: "Prepare me for my next meeting", description: "desc2" },
  { icon: "alert-triangle", title: "Any conflicts this week?", description: "desc3" },
  { icon: "bar-chart-3", title: "Summarize today's schedule", description: "desc4" },
];

function makeItem(id: string): AttentionItem {
  return {
    id,
    icon: "calendar",
    title: `Item ${id}`,
    description: `Description ${id}`,
    metadata: {},
  };
}

function createDefaultOptions(overrides: Partial<Parameters<typeof useKeyboardNav>[0]> = {}) {
  return {
    items: [makeItem("1"), makeItem("2"), makeItem("3")],
    suggestions: TEST_SUGGESTIONS,
    hasMessages: false,
    isStreaming: false,
    chatPanelRef: { current: null },
    chatInputRef: { current: null },
    toggleSelect: vi.fn(),
    onOpen: vi.fn(),
    sendMessage: vi.fn(),
    ...overrides,
  };
}

function pressCtrl(key: string): void {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
}

function pressKey(key: string): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useKeyboardNav", () => {
  describe("Ctrl+j/k vertical navigation", () => {
    it("first Ctrl+j activates attention panel at index 0", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      expect(result.current.focusedPanel).toBeNull();
      expect(result.current.focusedIndex).toBe(0);

      act(() => pressCtrl("j"));

      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("first Ctrl+k activates attention panel at index 0", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("k"));

      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+j moves focusedIndex down by 1, clamped at last index", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      // Activate
      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(0);

      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(1);

      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(2);

      // Clamped at last index (2 for 3 items)
      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(2);
    });

    it("Ctrl+k moves focusedIndex up by 1, clamped at 0", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      // Navigate to index 2
      act(() => pressCtrl("j"));
      act(() => pressCtrl("j"));
      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(2);

      act(() => pressCtrl("k"));
      expect(result.current.focusedIndex).toBe(1);

      act(() => pressCtrl("k"));
      expect(result.current.focusedIndex).toBe(0);

      // Clamped at 0
      act(() => pressCtrl("k"));
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+j is no-op when no panels have items", () => {
      const options = createDefaultOptions({ items: [], hasMessages: true });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));

      expect(result.current.focusedPanel).toBeNull();
    });

    it("first Ctrl+j picks suggestions when attention is empty but suggestions visible", () => {
      const options = createDefaultOptions({ items: [], hasMessages: false });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));

      expect(result.current.focusedPanel).toBe("suggestions");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+j blurs chat input so Space/Enter work on focused items", () => {
      const inputEl = document.createElement("input");
      document.body.appendChild(inputEl);
      const chatInputRef = { current: inputEl } as unknown as React.RefObject<HTMLInputElement | null>;
      const toggleSelect = vi.fn();
      const options = createDefaultOptions({ chatInputRef, toggleSelect });
      renderHook(() => useKeyboardNav(options));

      // Focus the input first
      inputEl.focus();
      expect(document.activeElement).toBe(inputEl);

      // Ctrl+j should blur it
      act(() => pressCtrl("j"));
      expect(document.activeElement).not.toBe(inputEl);

      // Now Space should work (toggle selection)
      act(() => pressKey(" "));
      expect(toggleSelect).toHaveBeenCalledWith("1");

      document.body.removeChild(inputEl);
    });

    it("first Ctrl+j picks attention when both panels have items", () => {
      const options = createDefaultOptions({ hasMessages: false });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));

      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });
  });

  describe("Ctrl+h/l panel switching", () => {
    it("Ctrl+h switches to attention panel and resets index to 0", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      // Start on suggestions
      act(() => pressCtrl("l"));
      expect(result.current.focusedPanel).toBe("suggestions");

      act(() => pressCtrl("h"));
      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+h is no-op when attention items list is empty", () => {
      const options = createDefaultOptions({ items: [] });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("h"));

      expect(result.current.focusedPanel).toBeNull();
    });

    it("Ctrl+l switches to suggestions panel and resets index to 0", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      // Activate attention
      act(() => pressCtrl("j"));

      act(() => pressCtrl("l"));
      expect(result.current.focusedPanel).toBe("suggestions");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+l is no-op when chat has messages (suggestions not visible)", () => {
      const options = createDefaultOptions({ hasMessages: true });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("l"));

      expect(result.current.focusedPanel).toBeNull();
    });

    it("Ctrl+j/k on suggestions panel reverts to attention when chat has messages", () => {
      const options = createDefaultOptions({ hasMessages: false });
      const { result, rerender } = renderHook(
        (props) => useKeyboardNav(props),
        { initialProps: options },
      );

      // Set focus to suggestions
      act(() => pressCtrl("l"));
      expect(result.current.focusedPanel).toBe("suggestions");

      // Now messages arrive — suggestions is no longer valid
      rerender({ ...options, hasMessages: true });

      act(() => pressCtrl("j"));
      expect(result.current.focusedPanel).toBe("attention");
    });
  });

  describe("Ctrl+u/d chat scrolling", () => {
    it("Ctrl+d scrolls chat panel down by half clientHeight", () => {
      const mockScrollBy = vi.fn();
      const chatPanelRef = {
        current: { clientHeight: 400, scrollBy: mockScrollBy } as unknown as HTMLDivElement,
      };
      const options = createDefaultOptions({ hasMessages: true, chatPanelRef });

      // Mock matchMedia for prefers-reduced-motion
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockReturnValue({ matches: false }),
      });

      renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("d"));

      expect(mockScrollBy).toHaveBeenCalledWith({ top: 200, behavior: "smooth" });
    });

    it("Ctrl+u scrolls chat panel up by half clientHeight", () => {
      const mockScrollBy = vi.fn();
      const chatPanelRef = {
        current: { clientHeight: 400, scrollBy: mockScrollBy } as unknown as HTMLDivElement,
      };
      const options = createDefaultOptions({ hasMessages: true, chatPanelRef });

      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockReturnValue({ matches: false }),
      });

      renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("u"));

      expect(mockScrollBy).toHaveBeenCalledWith({ top: -200, behavior: "smooth" });
    });

    it("uses instant scroll when prefers-reduced-motion is set", () => {
      const mockScrollBy = vi.fn();
      const chatPanelRef = {
        current: { clientHeight: 400, scrollBy: mockScrollBy } as unknown as HTMLDivElement,
      };
      const options = createDefaultOptions({ hasMessages: true, chatPanelRef });

      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockReturnValue({ matches: true }),
      });

      renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("d"));

      expect(mockScrollBy).toHaveBeenCalledWith({ top: 200, behavior: "instant" });
    });

    it("Ctrl+d/u is no-op when chat is empty", () => {
      const mockScrollBy = vi.fn();
      const chatPanelRef = {
        current: { clientHeight: 400, scrollBy: mockScrollBy } as unknown as HTMLDivElement,
      };
      const options = createDefaultOptions({ hasMessages: false, chatPanelRef });

      renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("d"));
      act(() => pressCtrl("u"));

      expect(mockScrollBy).not.toHaveBeenCalled();
    });
  });

  describe("Space/Enter actions", () => {
    it("Space toggles selection on focused attention item", () => {
      const toggleSelect = vi.fn();
      const options = createDefaultOptions({ toggleSelect });
      const { result } = renderHook(() => useKeyboardNav(options));

      // Activate attention, move to index 1
      act(() => pressCtrl("j"));
      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(1);

      act(() => pressKey(" "));
      expect(toggleSelect).toHaveBeenCalledWith("2");
    });

    it("Enter opens focused attention item", () => {
      const onOpen = vi.fn();
      const options = createDefaultOptions({ onOpen });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(0);

      act(() => pressKey("Enter"));
      expect(onOpen).toHaveBeenCalledWith("1");
    });

    it("Enter sends focused suggestion as chat prompt", () => {
      const sendMessage = vi.fn();
      const options = createDefaultOptions({ sendMessage });
      const { result } = renderHook(() => useKeyboardNav(options));

      // Switch to suggestions panel
      act(() => pressCtrl("l"));
      expect(result.current.focusedPanel).toBe("suggestions");

      act(() => pressKey("Enter"));
      expect(sendMessage).toHaveBeenCalledWith("What are my next meetings?");
    });

    it("Space/Enter are not intercepted when focusedPanel is null", () => {
      const toggleSelect = vi.fn();
      const onOpen = vi.fn();
      const options = createDefaultOptions({ toggleSelect, onOpen });
      renderHook(() => useKeyboardNav(options));

      act(() => pressKey(" "));
      act(() => pressKey("Enter"));

      expect(toggleSelect).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("Space/Enter are not intercepted when a text input has focus", () => {
      const toggleSelect = vi.fn();
      const options = createDefaultOptions({ toggleSelect });
      const { result } = renderHook(() => useKeyboardNav(options));

      // Activate attention
      act(() => pressCtrl("j"));
      expect(result.current.focusedPanel).toBe("attention");

      // Create and focus a text input
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      input.focus();

      act(() => pressKey(" "));
      expect(toggleSelect).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });
  });

  describe("Focus state management", () => {
    it("clears focus on mouse click", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));
      expect(result.current.focusedPanel).toBe("attention");

      act(() => {
        document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(result.current.focusedPanel).toBeNull();
      expect(result.current.focusedIndex).toBe(0);
    });

    it("clears focus when chat input gains focus", () => {
      const inputEl = document.createElement("input");
      document.body.appendChild(inputEl);
      const chatInputRef = { current: inputEl };
      const options = createDefaultOptions({ chatInputRef: chatInputRef as unknown as React.RefObject<HTMLInputElement | null> });
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));
      expect(result.current.focusedPanel).toBe("attention");

      act(() => inputEl.focus());

      expect(result.current.focusedPanel).toBeNull();

      document.body.removeChild(inputEl);
    });

    it("resetFocus clears panel and index", () => {
      const options = createDefaultOptions();
      const { result } = renderHook(() => useKeyboardNav(options));

      act(() => pressCtrl("j"));
      act(() => pressCtrl("j"));
      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(1);

      act(() => result.current.resetFocus());

      expect(result.current.focusedPanel).toBeNull();
      expect(result.current.focusedIndex).toBe(0);
    });

    it("clamps focusedIndex when items shrink", () => {
      const items = [makeItem("1"), makeItem("2"), makeItem("3")];
      const options = createDefaultOptions({ items });
      const { result, rerender } = renderHook(
        (props) => useKeyboardNav(props),
        { initialProps: options },
      );

      // Navigate to last index
      act(() => pressCtrl("j"));
      act(() => pressCtrl("j"));
      act(() => pressCtrl("j"));
      expect(result.current.focusedIndex).toBe(2);

      // Remove last item
      rerender({ ...options, items: [makeItem("1")] });

      expect(result.current.focusedIndex).toBe(0);
    });

    it("resets focus when items become empty", () => {
      const options = createDefaultOptions();
      const { result, rerender } = renderHook(
        (props) => useKeyboardNav(props),
        { initialProps: options },
      );

      act(() => pressCtrl("j"));
      expect(result.current.focusedPanel).toBe("attention");

      rerender({ ...options, items: [] });

      expect(result.current.focusedPanel).toBeNull();
    });
  });

  describe("preventDefault and stopPropagation", () => {
    it("prevents default on Ctrl+j", () => {
      const options = createDefaultOptions();
      renderHook(() => useKeyboardNav(options));

      const event = new KeyboardEvent("keydown", {
        key: "j",
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
});
