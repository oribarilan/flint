import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import { useKeybindings } from "../hooks/useKeybindings";
import type { KitSearchResult } from "../kits/types";
import * as commands from "../lib/commands";

vi.mock("../lib/commands", () => ({
  hideWindow: vi.fn(() => Promise.resolve()),
  openSettings: vi.fn(() => Promise.resolve()),
  searchFiles: vi.fn(() => Promise.resolve([])),
  searchAll: vi.fn(() => Promise.resolve([])),
  getChatStatus: vi.fn(() =>
    Promise.resolve({ connected: false, session_id: null, repo_path: null }),
  ),
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
    activeCommand: null,
  });
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    currentResponse: "",
    chatStatus: { connected: false, sessionId: null, repoPath: null },
  });
  vi.clearAllMocks();
});

describe("Escape layering", () => {
  const MOCK_RESULT: KitSearchResult = {
    kitId: "core",
    id: "/tmp/test.ts",
    title: "test.ts",
    kind: { type: "File" },
    actions: [{ type: "Open", target: "/tmp/test.ts" }],
  };

  it("Layer 0: closes Action Panel before popping command chip", () => {
    useSearchStore.setState({
      results: [MOCK_RESULT],
      selectedIndex: 0,
      mode: "search",
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
    });
    renderHook(() => {
      useKeybindings(createActions());
    });

    useSearchStore.getState().openActionPanel();
    expect(useSearchStore.getState().actionPanelOpen).toBe(true);

    fireEscape();

    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
    // Command chip still active — next Escape would pop it
    expect(useSearchStore.getState().activeCommand).not.toBeNull();
  });

  it("Layer 1: pops command chip before clearing input", () => {
    useSearchStore.setState({
      query: "2+3",
      mode: "search",
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
    });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    // Chip should be popped first, query cleared as part of deactivation
    expect(useSearchStore.getState().activeCommand).toBeNull();
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("Layer 2: clears input when query has text in search mode", () => {
    useSearchStore.setState({ query: "hello", mode: "search" });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("Layer 2: clears input when query has text in agent mode (preserves mode)", () => {
    useSearchStore.setState({ query: "what is rust?", mode: "agent" });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("agent");
  });

  it("Layer 3: clears chat session when messages exist and input is empty (stays in mode)", () => {
    useSearchStore.setState({ query: "", mode: "agent" });
    useChatStore.setState({
      messages: [{ role: "user", content: "hi" }],
    });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("agent");
  });

  it("Layer 4: dismisses window when in agent mode with empty input and no messages", () => {
    useSearchStore.setState({ query: "", mode: "agent" });
    useChatStore.setState({ messages: [] });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });

  it("Layer 4: dismisses window when search mode with empty input and no chat", () => {
    useSearchStore.setState({ query: "", mode: "search" });
    useChatStore.setState({ messages: [] });
    renderHook(() => {
      useKeybindings(createActions());
    });

    fireEscape();

    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });

  it("processes layers sequentially across multiple presses", () => {
    // Start: agent mode with query text and messages
    useSearchStore.setState({ query: "test query", mode: "agent" });
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
    expect(useSearchStore.getState().mode).toBe("agent");
    expect(useChatStore.getState().messages).toHaveLength(2);

    // Second Escape: clears chat (Layer 2), stays in agent mode
    fireEscape();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("agent");

    // Third Escape: dismisses window (Layer 3)
    fireEscape();
    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });
});
