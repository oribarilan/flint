import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import { useKeybindings } from "../hooks/useKeybindings";
import * as commands from "../lib/commands";

vi.mock("../lib/commands", () => ({
  hideWindow: vi.fn(() => Promise.resolve()),
  openSettings: vi.fn(() => Promise.resolve()),
  searchFiles: vi.fn(() => Promise.resolve([])),
  getAuthStatus: vi.fn(() => Promise.resolve({ authenticated: false, username: null })),
  sendChatMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/platform", () => ({
  isMac: vi.fn(() => false),
}));

function createActions() {
  return {
    onToggleMode: vi.fn(),
    onFocusSearchBar: vi.fn(),
    onOpenResult: vi.fn(),
  };
}

function fireEscape() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  useSearchStore.setState({
    mode: "search",
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
  });
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    isAuthenticating: false,
    currentResponse: "",
    authStatus: { authenticated: false, username: null },
  });
  vi.clearAllMocks();
});

describe("Escape layering", () => {
  it("Layer 1: clears input when query has text in search mode", () => {
    useSearchStore.setState({ query: "hello", mode: "search" });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("Layer 1: clears input when query has text in chat mode (preserves mode)", () => {
    useSearchStore.setState({ query: "what is rust?", mode: "chat" });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("chat");
  });

  it("Layer 2: clears chat session when messages exist and input is empty (stays in mode)", () => {
    useSearchStore.setState({ query: "", mode: "chat" });
    useChatStore.setState({
      messages: [{ role: "user", content: "hi" }],
    });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("chat");
  });

  it("Layer 3: dismisses window when in chat mode with empty input and no messages", () => {
    useSearchStore.setState({ query: "", mode: "chat" });
    useChatStore.setState({ messages: [] });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });

  it("Layer 3: dismisses window when search mode with empty input and no chat", () => {
    useSearchStore.setState({ query: "", mode: "search" });
    useChatStore.setState({ messages: [] });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });

  it("processes layers sequentially across multiple presses", () => {
    // Start: chat mode with query text and messages
    useSearchStore.setState({ query: "test query", mode: "chat" });
    useChatStore.setState({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    });
    renderHook(() => {
      useKeybindings(createActions());
    });

    // First Escape: clears input (Layer 1)
    fireEscape();
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("chat");
    expect(useChatStore.getState().messages).toHaveLength(2);

    // Second Escape: clears chat (Layer 2), stays in chat mode
    fireEscape();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("chat");

    // Third Escape: dismisses window (Layer 3)
    fireEscape();
    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });
});
