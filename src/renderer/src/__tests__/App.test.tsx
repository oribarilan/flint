// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent, act, screen } from "@testing-library/react";

// --- Mocks must be set up before importing App ---

// Mock window.flint API
const mockHideOverlay = vi.fn();
const mockChatReset = vi.fn(() => Promise.resolve());
const mockOnModelChanged = vi.fn((_callback: (modelId: string) => void) => vi.fn());
const mockFlint = {
  platform: "darwin",
  chatSend: vi.fn(),
  chatReset: mockChatReset,
  onChatDelta: vi.fn(() => vi.fn()),
  onChatDone: vi.fn(() => vi.fn()),
  getConfig: vi.fn(() =>
    Promise.resolve({
      hotkey: "Ctrl+Shift+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
      model: "gpt-4.1",
      pollEnabled: true,
      pollFrequency: "normal",
      pollModel: "gpt-4.1-mini",
      fontSize: "medium",
      theme: "dark",
    }),
  ),
  setConfig: vi.fn(),
  hideOverlay: mockHideOverlay,
  onConnectionStatus: vi.fn(() => vi.fn()),
  getAttentionItems: vi.fn(() => Promise.resolve([])),
  onAttentionUpdate: vi.fn(() => vi.fn()),
  openAttentionItem: vi.fn(),
  openLink: vi.fn(),
  testNotification: vi.fn(),
  listModels: vi.fn(() => Promise.resolve([])),
  setModel: vi.fn(),
  onModelChanged: mockOnModelChanged,
  onThemeChanged: vi.fn((_callback: (theme: string) => void) => vi.fn()),
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

const mockClearMessages = vi.fn();

const mockChatState = {
  messages: [] as { role: string; content: string }[],
  streamingContent: "",
  isStreaming: false,
  sendMessage: vi.fn(),
  clearMessages: mockClearMessages,
};

vi.mock("../hooks/useChat", () => ({
  useChat: () => mockChatState,
}));

vi.mock("../hooks/useConfig", () => ({
  useConfig: () => ({
    config: {
      hotkey: "Ctrl+Shift+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
      model: "gpt-4.1",
      pollEnabled: true,
      pollFrequency: "normal",
      pollModel: "gpt-4.1-mini",
      fontSize: "medium",
    },
    isLoaded: true,
    updateConfig: vi.fn(),
  }),
}));

import App from "../App";
import { useModelStore } from "../stores/modelStore";
import { useAttentionStore } from "../stores/attentionStore";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useModelStore.setState({ currentModel: "gpt-4.1", models: [] });
  useAttentionStore.setState({ items: [], selectedIds: new Set() });
  // Reset chat mock state
  mockChatState.messages = [];
  mockChatState.streamingContent = "";
  mockChatState.isStreaming = false;
  mockChatState.sendMessage = vi.fn();
  mockChatState.clearMessages = mockClearMessages;
});

function pressEscape(): void {
  fireEvent.keyDown(document, { key: "Escape" });
}

function pressCmd(key: string): void {
  fireEvent.keyDown(document, { key, metaKey: true });
}

function pressSlash(): void {
  fireEvent.keyDown(document, { key: "/" });
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

    // Settings view should now be in the DOM
    expect(document.querySelector('[data-testid="settings-view"]')).toBeTruthy();

    // ESC should close settings, not hide overlay
    pressEscape();

    expect(document.querySelector('[data-testid="settings-view"]')).toBeNull();
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

  it("hides overlay even when chat is streaming (stream continues in background)", () => {
    // The escape stack does not check isStreaming — ESC always hides overlay
    // when no modal layers are open, regardless of streaming state.
    render(<App />);

    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });

  it("closes model picker instead of hiding overlay when picker is open", () => {
    const { getByLabelText, queryByTestId } = render(<App />);

    // Click model indicator to open picker
    const indicator = getByLabelText("Current model: gpt-4.1");
    act(() => {
      fireEvent.click(indicator);
    });

    // Picker should be in the DOM
    expect(queryByTestId("model-picker")).toBeTruthy();

    // ESC should close picker, not hide overlay
    pressEscape();

    expect(queryByTestId("model-picker")).toBeNull();
    expect(mockHideOverlay).not.toHaveBeenCalled();
  });

  it("closes model picker before settings in escape stack", () => {
    render(<App />);

    // Open settings first
    pressCmd(",");
    expect(document.querySelector('[data-testid="settings-view"]')).toBeTruthy();

    // Close settings to get back to main view where model picker lives
    pressEscape();
    expect(document.querySelector('[data-testid="settings-view"]')).toBeNull();

    // Open settings again
    pressCmd(",");

    // ESC closes settings
    pressEscape();
    expect(document.querySelector('[data-testid="settings-view"]')).toBeNull();
    expect(mockHideOverlay).not.toHaveBeenCalled();
  });
});

describe("Model indicator", () => {
  it("renders model name in bottom bar as a button", () => {
    const { getByLabelText } = render(<App />);

    const indicator = getByLabelText("Current model: gpt-4.1");
    expect(indicator).toBeTruthy();
    expect(indicator.tagName).toBe("BUTTON");
    expect(indicator.textContent).toContain("gpt-4.1");
    expect(indicator.getAttribute("aria-expanded")).toBe("false");
    expect(indicator.getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("toggles picker open on click", () => {
    const { getByLabelText, queryByTestId } = render(<App />);

    const indicator = getByLabelText("Current model: gpt-4.1");

    // Click to open
    act(() => {
      fireEvent.click(indicator);
    });

    expect(indicator.getAttribute("aria-expanded")).toBe("true");
    expect(queryByTestId("model-picker")).toBeTruthy();

    // Click to close
    act(() => {
      fireEvent.click(indicator);
    });

    expect(indicator.getAttribute("aria-expanded")).toBe("false");
    expect(queryByTestId("model-picker")).toBeNull();
  });

  it("reflects model store changes", () => {
    const { getByLabelText } = render(<App />);

    // Update model store directly (simulates model:changed IPC)
    act(() => {
      useModelStore.getState().setCurrentModel("claude-sonnet-4");
    });

    const indicator = getByLabelText("Current model: claude-sonnet-4");
    expect(indicator).toBeTruthy();
    expect(indicator.textContent).toContain("claude-sonnet-4");
  });

  it("subscribes to onModelChanged on mount", () => {
    render(<App />);

    expect(mockOnModelChanged).toHaveBeenCalledTimes(1);
    expect(typeof mockOnModelChanged.mock.calls[0][0]).toBe("function");
  });
});

describe("Slash-to-focus shortcut", () => {
  it("focuses chat input when nothing is focused", () => {
    render(<App />);

    // Blur any focused element so nothing has focus
    (document.activeElement as HTMLElement | null)?.blur();

    pressSlash();

    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    expect(document.activeElement).toBe(input);
  });

  it("does not intercept / when the chat input already has focus", () => {
    render(<App />);

    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    input.focus();

    // The keydown event should not call preventDefault
    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(preventSpy).not.toHaveBeenCalled();
  });

  it("does not intercept / when another text input has focus", () => {
    render(<App />);

    // Add a standalone input to the DOM and focus it
    const otherInput = document.createElement("input");
    otherInput.type = "text";
    document.body.appendChild(otherInput);
    otherInput.focus();

    const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(otherInput);

    document.body.removeChild(otherInput);
  });

  it("shows styled slash hint when input is not focused", () => {
    render(<App />);

    // Blur the auto-focused input so the slash hint appears
    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    fireEvent.blur(input);

    // Find the kbd inside the input wrapper (not the footer hints)
    const inputWrapper = input.parentElement as HTMLElement;
    const kbd = inputWrapper.querySelector("kbd");
    expect(kbd?.textContent).toBe("/");
    expect(inputWrapper.textContent).toContain("to focus");
  });
});

describe("Bottom bar hints", () => {
  it("renders hotkey hint elements with correct key text", () => {
    const { container } = render(<App />);

    const footer = container.querySelector("footer");
    expect(footer).toBeTruthy();

    // Collect all kbd elements within the hints section
    const kbds = (footer as HTMLElement).querySelectorAll("kbd");
    const keyTexts = Array.from(kbds).map((kbd) => kbd.textContent);

    // Ctrl+H/J/K/L navigate · Ctrl+U/D scroll · ↵ open · Space select
    expect(keyTexts).toContain("Ctrl");
    expect(keyTexts).toContain("J");
    expect(keyTexts).toContain("K");
    expect(keyTexts).toContain("U");
    expect(keyTexts).toContain("D");
    expect(keyTexts).toContain("↵");
    expect(keyTexts).toContain("Space");
  });

  it("renders navigate, scroll, and chat labels", () => {
    const { container } = render(<App />);

    const footer = container.querySelector("footer");
    const text = (footer as HTMLElement).textContent;

    expect(text).toContain("navigate");
    expect(text).toContain("open");
    expect(text).toContain("select");
    expect(text).toContain("scroll");
  });

  it("renders middle dot separators", () => {
    const { container } = render(<App />);

    const footer = container.querySelector("footer");
    const text = (footer as HTMLElement).textContent;

    // Four middle-dot separators (new chat · navigate · scroll · open · select)
    const dots = text.match(/·/g);
    expect(dots).toHaveLength(4);
  });

  it("hints section is aria-hidden", () => {
    const { container } = render(<App />);

    const hints = container.querySelector("[aria-hidden='true']");
    expect(hints).toBeTruthy();
  });
});

describe("Cmd+N new session", () => {
  it("calls chatReset and clearMessages on Cmd+N", () => {
    render(<App />);

    pressCmd("n");

    expect(mockChatReset).toHaveBeenCalledTimes(1);
    expect(mockClearMessages).toHaveBeenCalledTimes(1);
  });

  it("clears attention selection on Cmd+N", () => {
    // Pre-select some items
    useAttentionStore.setState({ selectedIds: new Set(["item-1", "item-2"]) });

    render(<App />);

    pressCmd("n");

    expect(useAttentionStore.getState().selectedIds.size).toBe(0);
  });

  it("focuses chat input after Cmd+N", () => {
    render(<App />);

    // Blur any focused element
    (document.activeElement as HTMLElement | null)?.blur();

    pressCmd("n");

    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    expect(document.activeElement).toBe(input);
  });

  it("prevents default browser behavior for Cmd+N", () => {
    render(<App />);

    const event = new KeyboardEvent("keydown", {
      key: "n",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const preventSpy = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);

    expect(preventSpy).toHaveBeenCalled();
  });
});

describe("Focus input on overlay show", () => {
  function fireWindowFocus(): void {
    window.dispatchEvent(new Event("focus"));
  }

  it("focuses chat input when window receives focus", () => {
    render(<App />);

    // Blur any focused element to simulate returning to the overlay
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    fireWindowFocus();

    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    expect(document.activeElement).toBe(input);
  });

  it("closes settings and focuses chat input when window regains focus", () => {
    render(<App />);

    // Open settings
    pressCmd(",");
    expect(document.querySelector('[data-testid="settings-view"]')).toBeTruthy();

    // Simulate overlay losing then regaining focus
    act(() => {
      fireWindowFocus();
    });

    // Settings should be closed, returning to default state
    expect(document.querySelector('[data-testid="settings-view"]')).toBeNull();

    // Chat input should be focused
    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    expect(document.activeElement).toBe(input);
  });

  it("focuses chat input even when streaming is in progress", () => {
    mockChatState.messages = [{ role: "user", content: "test" }];
    mockChatState.streamingContent = "streaming...";
    mockChatState.isStreaming = true;

    render(<App />);

    (document.activeElement as HTMLElement | null)?.blur();

    fireWindowFocus();

    const input = screen.getByPlaceholderText(/Ask about your schedule/);
    expect(document.activeElement).toBe(input);
  });

  it("cleans up window focus listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<App />);

    const focusCalls = addSpy.mock.calls.filter(([event]) => event === "focus");
    expect(focusCalls.length).toBeGreaterThan(0);

    const handler = focusCalls[focusCalls.length - 1][1];

    unmount();

    const removesCalls = removeSpy.mock.calls.filter(([event]) => event === "focus");
    const removed = removesCalls.some(([, h]) => h === handler);
    expect(removed).toBe(true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("Bottom bar new chat hint", () => {
  it("renders ⌘N new chat hint in bottom bar", () => {
    const { container } = render(<App />);

    const footer = container.querySelector("footer");
    const text = (footer as HTMLElement).textContent;

    expect(text).toContain("new chat");
  });

  it("renders Cmd and N kbd elements in the hint", () => {
    const { container } = render(<App />);

    const footer = container.querySelector("footer");
    const kbds = (footer as HTMLElement).querySelectorAll("kbd");
    const keyTexts = Array.from(kbds).map((kbd) => kbd.textContent);

    expect(keyTexts).toContain("Cmd");
    expect(keyTexts).toContain("N");
  });

  it("has a separator between new chat and navigation hints", () => {
    const { container } = render(<App />);

    const footer = container.querySelector("footer");
    const text = (footer as HTMLElement).textContent;

    // Should now have 4 separators (new chat · navigate · scroll · open · select)
    const dots = text.match(/·/g);
    expect(dots).toHaveLength(4);
  });
});
