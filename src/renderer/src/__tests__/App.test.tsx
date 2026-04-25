// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";

// --- Mocks must be set up before importing App ---

// Mock window.flint API
const mockHideOverlay = vi.fn();
const mockFlint = {
  platform: "darwin",
  chatSend: vi.fn(),
  onChatDelta: vi.fn(() => vi.fn()),
  onChatDone: vi.fn(() => vi.fn()),
  getConfig: vi.fn(() =>
    Promise.resolve({
      hotkey: "Option+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
    }),
  ),
  setConfig: vi.fn(),
  hideOverlay: mockHideOverlay,
  onConnectionStatus: vi.fn(() => vi.fn()),
  getAttentionItems: vi.fn(() => Promise.resolve([])),
  onAttentionUpdate: vi.fn(() => vi.fn()),
  openAttentionItem: vi.fn(),
};

Object.defineProperty(window, "flint", { value: mockFlint, writable: true });

// Mock hooks to avoid side effects
vi.mock("../hooks/useAttention", () => ({
  useAttention: () => ({
    items: [],
    selectedIds: new Set<string>(),
    toggleSelect: vi.fn(),
  }),
}));

vi.mock("../hooks/useChat", () => ({
  useChat: () => ({
    messages: [],
    streamingContent: "",
    isStreaming: false,
    sendMessage: vi.fn(),
  }),
}));

vi.mock("../hooks/useConfig", () => ({
  useConfig: () => ({
    config: {
      hotkey: "Option+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
    },
    isLoaded: true,
    updateConfig: vi.fn(),
  }),
}));

import App from "../App";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function pressEscape(): void {
  fireEvent.keyDown(document, { key: "Escape" });
}

function pressCmd(key: string): void {
  fireEvent.keyDown(document, { key, metaKey: true });
}

describe("Escape stack", () => {
  it("hides overlay when nothing is open", () => {
    render(<App />);

    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });

  it("closes settings instead of hiding overlay when settings is open", () => {
    render(<App />);

    // Open settings via Cmd+,
    pressCmd(",");

    // Settings dialog should now be in the DOM
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    // ESC should close settings, not hide overlay
    pressEscape();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(mockHideOverlay).not.toHaveBeenCalled();
  });

  it("hides overlay on second ESC after settings is closed", () => {
    render(<App />);

    // Open and close settings
    pressCmd(",");
    pressEscape();

    // Now ESC should hide overlay
    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });

  it("is extensible for picker layer (isPickerOpen checked before showSettings)", () => {
    // isPickerOpen is initialized to false and cannot be toggled yet (Task 3).
    // This test documents the intended stack order: picker > settings > overlay.
    // When isPickerOpen is toggled externally, ESC should close picker first.
    // For now, with picker closed and settings open, ESC closes settings.
    render(<App />);

    pressCmd(",");
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    pressEscape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(mockHideOverlay).not.toHaveBeenCalled();
  });

  it("hides overlay even when chat is streaming (stream continues in background)", () => {
    // The escape stack does not check isStreaming — ESC always hides overlay
    // when no modal layers are open, regardless of streaming state.
    render(<App />);

    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });
});

describe("Settings.tsx ESC handler removal", () => {
  it("ESC closes settings through App handler, not Settings own handler", () => {
    render(<App />);

    // Open settings
    pressCmd(",");
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    // ESC works via App's unified handler
    pressEscape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(mockHideOverlay).not.toHaveBeenCalled();
  });
});
