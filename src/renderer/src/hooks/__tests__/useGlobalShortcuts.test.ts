// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { RefObject } from "react";

import { useGlobalShortcuts } from "../useGlobalShortcuts";

function press(
  key: string,
  modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  document.dispatchEvent(event);
  return event;
}

function makeOptions(overrides: Partial<Parameters<typeof useGlobalShortcuts>[0]> = {}) {
  const chatInputRef: RefObject<HTMLInputElement | null> = { current: null };
  return {
    chatInputRef,
    isPickerOpen: false,
    showSettings: false,
    toggleSettings: vi.fn(),
    closePicker: vi.fn(),
    closeSettings: vi.fn(),
    resetFocus: vi.fn(),
    onResetChat: vi.fn(),
    onClearMessages: vi.fn(),
    onClearSelection: vi.fn(),
    onHideOverlay: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useGlobalShortcuts", () => {
  describe("Cmd/Ctrl+, — settings", () => {
    it("Cmd+, toggles settings", () => {
      const toggleSettings = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(makeOptions({ toggleSettings }));
      });

      act(() => {
        press(",", { metaKey: true });
      });

      expect(toggleSettings).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+, toggles settings (cross-platform)", () => {
      const toggleSettings = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(makeOptions({ toggleSettings }));
      });

      act(() => {
        press(",", { ctrlKey: true });
      });

      expect(toggleSettings).toHaveBeenCalledTimes(1);
    });

    it("plain , does nothing", () => {
      const toggleSettings = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(makeOptions({ toggleSettings }));
      });

      act(() => {
        press(",");
      });

      expect(toggleSettings).not.toHaveBeenCalled();
    });
  });

  describe("Cmd+N — new chat", () => {
    it("invokes reset chat, clear messages, clear selection, and focuses chat input", () => {
      const inputEl = document.createElement("input");
      document.body.appendChild(inputEl);
      const onResetChat = vi.fn();
      const onClearMessages = vi.fn();
      const onClearSelection = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(
          makeOptions({
            chatInputRef: { current: inputEl },
            onResetChat,
            onClearMessages,
            onClearSelection,
          }),
        );
      });

      act(() => {
        press("n", { metaKey: true });
      });

      expect(onResetChat).toHaveBeenCalledTimes(1);
      expect(onClearMessages).toHaveBeenCalledTimes(1);
      expect(onClearSelection).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(inputEl);

      document.body.removeChild(inputEl);
    });

    it("plain n does nothing", () => {
      const onResetChat = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(makeOptions({ onResetChat }));
      });

      act(() => {
        press("n");
      });

      expect(onResetChat).not.toHaveBeenCalled();
    });
  });

  describe("Esc — priority order", () => {
    it("closes picker first when picker is open", () => {
      const closePicker = vi.fn();
      const closeSettings = vi.fn();
      const resetFocus = vi.fn();
      const onHideOverlay = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(
          makeOptions({
            isPickerOpen: true,
            showSettings: true, // both open — picker takes priority
            closePicker,
            closeSettings,
            resetFocus,
            onHideOverlay,
          }),
        );
      });

      act(() => {
        press("Escape");
      });

      expect(closePicker).toHaveBeenCalledTimes(1);
      expect(closeSettings).not.toHaveBeenCalled();
      expect(resetFocus).not.toHaveBeenCalled();
      expect(onHideOverlay).not.toHaveBeenCalled();
    });

    it("closes settings second when picker is closed", () => {
      const closePicker = vi.fn();
      const closeSettings = vi.fn();
      const resetFocus = vi.fn();
      const onHideOverlay = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(
          makeOptions({
            isPickerOpen: false,
            showSettings: true,
            closePicker,
            closeSettings,
            resetFocus,
            onHideOverlay,
          }),
        );
      });

      act(() => {
        press("Escape");
      });

      expect(closePicker).not.toHaveBeenCalled();
      expect(closeSettings).toHaveBeenCalledTimes(1);
      expect(resetFocus).not.toHaveBeenCalled();
      expect(onHideOverlay).not.toHaveBeenCalled();
    });

    it("resets focus and hides overlay when nothing else is open", () => {
      const resetFocus = vi.fn();
      const onHideOverlay = vi.fn();
      renderHook(() => {
        useGlobalShortcuts(
          makeOptions({ isPickerOpen: false, showSettings: false, resetFocus, onHideOverlay }),
        );
      });

      act(() => {
        press("Escape");
      });

      expect(resetFocus).toHaveBeenCalledTimes(1);
      expect(onHideOverlay).toHaveBeenCalledTimes(1);
    });
  });

  describe("/ — focus chat input", () => {
    it("focuses chat input when no text input has focus", () => {
      const inputEl = document.createElement("input");
      document.body.appendChild(inputEl);
      renderHook(() => {
        useGlobalShortcuts(makeOptions({ chatInputRef: { current: inputEl } }));
      });

      // Ensure focus is on body
      (document.activeElement as HTMLElement | null)?.blur();

      const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      const preventSpy = vi.spyOn(event, "preventDefault");
      act(() => {
        document.dispatchEvent(event);
      });

      expect(document.activeElement).toBe(inputEl);
      expect(preventSpy).toHaveBeenCalled();

      document.body.removeChild(inputEl);
    });

    it("does NOT intercept / when a text input already has focus", () => {
      const otherInput = document.createElement("input");
      const chatInput = document.createElement("input");
      document.body.appendChild(otherInput);
      document.body.appendChild(chatInput);
      renderHook(() => {
        useGlobalShortcuts(makeOptions({ chatInputRef: { current: chatInput } }));
      });

      otherInput.focus();
      expect(document.activeElement).toBe(otherInput);

      const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
      const preventSpy = vi.spyOn(event, "preventDefault");
      act(() => {
        document.dispatchEvent(event);
      });

      // Focus stays on otherInput; preventDefault not called
      expect(document.activeElement).toBe(otherInput);
      expect(preventSpy).not.toHaveBeenCalled();

      document.body.removeChild(otherInput);
      document.body.removeChild(chatInput);
    });
  });
});
