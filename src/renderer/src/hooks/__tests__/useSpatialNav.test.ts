// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { AttentionItem } from "../../../../main/types";
import type { Suggestion } from "../../utils/suggestions";

import { useSpatialNav } from "../useSpatialNav";

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

function createDefaultOptions(overrides: Partial<Parameters<typeof useSpatialNav>[0]> = {}) {
  return {
    items: [makeItem("1"), makeItem("2"), makeItem("3")],
    suggestions: TEST_SUGGESTIONS,
    hasMessages: false,
    isStreaming: false,
    chatInputRef: { current: null },
    toggleSelect: vi.fn(),
    onOpen: vi.fn(),
    sendMessage: vi.fn(),
    ...overrides,
  };
}

function pressCtrl(key: string): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useSpatialNav", () => {
  describe("Ctrl+j/k vertical navigation", () => {
    it("first Ctrl+j activates attention panel at index 0", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      expect(result.current.focusedPanel).toBeNull();
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("first Ctrl+k activates attention panel at index 0", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("k");
      });
      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+j moves focusedIndex down by 1, clamped at last index", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(0);
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(1);
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(2);
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(2); // clamped
    });

    it("Ctrl+k moves focusedIndex up by 1, clamped at 0", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(2);

      act(() => {
        pressCtrl("k");
      });
      expect(result.current.focusedIndex).toBe(1);
      act(() => {
        pressCtrl("k");
      });
      expect(result.current.focusedIndex).toBe(0);
      act(() => {
        pressCtrl("k");
      });
      expect(result.current.focusedIndex).toBe(0); // clamped
    });

    it("Ctrl+j is no-op when no panels have items", () => {
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ items: [], hasMessages: true })),
      );

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBeNull();
    });

    it("first Ctrl+j picks suggestions when attention is empty but suggestions visible", () => {
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ items: [], hasMessages: false })),
      );

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("suggestions");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+j blurs chat input so Space/Enter work on focused items", () => {
      const inputEl = document.createElement("input");
      document.body.appendChild(inputEl);
      const chatInputRef = {
        current: inputEl,
      } as unknown as React.RefObject<HTMLInputElement | null>;
      const toggleSelect = vi.fn();
      renderHook(() => useSpatialNav(createDefaultOptions({ chatInputRef, toggleSelect })));

      inputEl.focus();
      expect(document.activeElement).toBe(inputEl);

      act(() => {
        pressCtrl("j");
      });
      expect(document.activeElement).not.toBe(inputEl);

      act(() => {
        pressKey(" ");
      });
      expect(toggleSelect).toHaveBeenCalledWith("1");

      document.body.removeChild(inputEl);
    });
  });

  describe("Ctrl+h/l panel switching", () => {
    it("Ctrl+h switches to attention panel and resets index to 0", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("l");
      });
      expect(result.current.focusedPanel).toBe("suggestions");
      act(() => {
        pressCtrl("h");
      });
      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+h is no-op when attention items list is empty", () => {
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ items: [] })),
      );

      act(() => {
        pressCtrl("h");
      });
      expect(result.current.focusedPanel).toBeNull();
    });

    it("Ctrl+l switches to suggestions panel and resets index to 0", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("l");
      });
      expect(result.current.focusedPanel).toBe("suggestions");
      expect(result.current.focusedIndex).toBe(0);
    });

    it("Ctrl+l is no-op when chat has messages (suggestions not visible)", () => {
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ hasMessages: true })),
      );

      act(() => {
        pressCtrl("l");
      });
      expect(result.current.focusedPanel).toBeNull();
    });

    it("Ctrl+j/k on suggestions panel reverts to attention when chat has messages", () => {
      const options = createDefaultOptions({ hasMessages: false });
      const { result, rerender } = renderHook((props) => useSpatialNav(props), {
        initialProps: options,
      });

      act(() => {
        pressCtrl("l");
      });
      expect(result.current.focusedPanel).toBe("suggestions");

      rerender({ ...options, hasMessages: true });

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("attention");
    });
  });

  describe("Space/Enter actions", () => {
    it("Space toggles selection on focused attention item", () => {
      const toggleSelect = vi.fn();
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ toggleSelect })),
      );

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(1);

      act(() => {
        pressKey(" ");
      });
      expect(toggleSelect).toHaveBeenCalledWith("2");
    });

    it("Enter opens focused attention item", () => {
      const onOpen = vi.fn();
      renderHook(() => useSpatialNav(createDefaultOptions({ onOpen })));

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressKey("Enter");
      });
      expect(onOpen).toHaveBeenCalledWith("1");
    });

    it("Enter sends focused suggestion as chat prompt", () => {
      const sendMessage = vi.fn();
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ sendMessage })),
      );

      act(() => {
        pressCtrl("l");
      });
      expect(result.current.focusedPanel).toBe("suggestions");

      act(() => {
        pressKey("Enter");
      });
      expect(sendMessage).toHaveBeenCalledWith("What are my next meetings?");
    });

    it("Space/Enter are not intercepted when focusedPanel is null", () => {
      const toggleSelect = vi.fn();
      const onOpen = vi.fn();
      renderHook(() => useSpatialNav(createDefaultOptions({ toggleSelect, onOpen })));

      act(() => {
        pressKey(" ");
      });
      act(() => {
        pressKey("Enter");
      });

      expect(toggleSelect).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("Space/Enter are not intercepted when a text input has focus", () => {
      const toggleSelect = vi.fn();
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ toggleSelect })),
      );

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("attention");

      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      input.focus();

      act(() => {
        pressKey(" ");
      });
      expect(toggleSelect).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });
  });

  describe("Focus state management", () => {
    it("clears focus on mouse click", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("j");
      });
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
      const { result } = renderHook(() =>
        useSpatialNav(
          createDefaultOptions({
            chatInputRef: chatInputRef as unknown as React.RefObject<HTMLInputElement | null>,
          }),
        ),
      );

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("attention");

      act(() => {
        inputEl.focus();
      });

      expect(result.current.focusedPanel).toBeNull();
      document.body.removeChild(inputEl);
    });

    it("resetFocus clears panel and index", () => {
      const { result } = renderHook(() => useSpatialNav(createDefaultOptions()));

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("attention");
      expect(result.current.focusedIndex).toBe(1);

      act(() => {
        result.current.resetFocus();
      });
      expect(result.current.focusedPanel).toBeNull();
      expect(result.current.focusedIndex).toBe(0);
    });

    it("clamps focusedIndex when items shrink", () => {
      const items = [makeItem("1"), makeItem("2"), makeItem("3")];
      const options = createDefaultOptions({ items });
      const { result, rerender } = renderHook((props) => useSpatialNav(props), {
        initialProps: options,
      });

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedIndex).toBe(2);

      rerender({ ...options, items: [makeItem("1")] });
      expect(result.current.focusedIndex).toBe(0);
    });

    it("resets focus when items become empty", () => {
      const options = createDefaultOptions();
      const { result, rerender } = renderHook((props) => useSpatialNav(props), {
        initialProps: options,
      });

      act(() => {
        pressCtrl("j");
      });
      expect(result.current.focusedPanel).toBe("attention");

      rerender({ ...options, items: [] });
      expect(result.current.focusedPanel).toBeNull();
    });
  });

  describe("disabled flag", () => {
    it("ignores all keyboard input when disabled=true", () => {
      const { result } = renderHook(() =>
        useSpatialNav(createDefaultOptions({ disabled: true })),
      );

      act(() => {
        pressCtrl("j");
      });
      act(() => {
        pressCtrl("h");
      });
      act(() => {
        pressCtrl("l");
      });
      expect(result.current.focusedPanel).toBeNull();
    });
  });

  describe("preventDefault and stopPropagation", () => {
    it("prevents default on Ctrl+j", () => {
      renderHook(() => useSpatialNav(createDefaultOptions()));

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
