import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import * as commands from "../lib/commands";

vi.mock("../lib/commands", () => ({
  hideWindow: vi.fn(() => Promise.resolve()),
  searchFiles: vi.fn(() => Promise.resolve([])),
  getAuthStatus: vi.fn(() => Promise.resolve({ authenticated: false, username: null })),
  sendChatMessage: vi.fn(() => Promise.resolve()),
  openResult: vi.fn(() => Promise.resolve()),
  startLogin: vi.fn(() => Promise.resolve({ userCode: "", verificationUri: "" })),
  pollLogin: vi.fn(() => Promise.resolve(false)),
}));

/**
 * Simulates the layered Escape handler from App.tsx.
 * Matches the logic in the global keydown listener so we can
 * unit-test each layer without rendering the full app.
 */
function simulateEscape(): "cleared-input" | "cleared-chat" | "dismissed" {
  // Layer 1: clear input text (preserve current mode)
  if (useSearchStore.getState().query.length > 0) {
    useSearchStore.setState({
      query: "",
      results: [],
      selectedIndex: 0,
      isLoading: false,
    });
    return "cleared-input";
  }

  // Layer 2: clear chat session, return to search mode
  const hasChat = useChatStore.getState().messages.length > 0;
  const inChatMode = useSearchStore.getState().mode === "chat";
  if (hasChat || inChatMode) {
    useChatStore.getState().clearChat();
    useSearchStore.getState().setMode("search");
    return "cleared-chat";
  }

  // Layer 3: dismiss window
  commands.hideWindow().catch(() => {
    // Window hide is best-effort
  });
  return "dismissed";
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

    const result = simulateEscape();

    expect(result).toBe("cleared-input");
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("Layer 1: clears input when query has text in chat mode (preserves mode)", () => {
    useSearchStore.setState({ query: "what is rust?", mode: "chat" });

    const result = simulateEscape();

    expect(result).toBe("cleared-input");
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("chat");
  });

  it("Layer 2: clears chat session when messages exist and input is empty", () => {
    useSearchStore.setState({ query: "", mode: "chat" });
    useChatStore.setState({
      messages: [{ role: "user", content: "hi" }],
    });

    const result = simulateEscape();

    expect(result).toBe("cleared-chat");
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("Layer 2: returns to search mode when in chat mode with empty input and no messages", () => {
    useSearchStore.setState({ query: "", mode: "chat" });
    useChatStore.setState({ messages: [] });

    const result = simulateEscape();

    expect(result).toBe("cleared-chat");
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("Layer 3: dismisses window when search mode with empty input and no chat", () => {
    useSearchStore.setState({ query: "", mode: "search" });
    useChatStore.setState({ messages: [] });

    const result = simulateEscape();

    expect(result).toBe("dismissed");
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

    // First Escape: clears input (Layer 1)
    expect(simulateEscape()).toBe("cleared-input");
    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("chat");
    expect(useChatStore.getState().messages).toHaveLength(2);

    // Second Escape: clears chat (Layer 2)
    expect(simulateEscape()).toBe("cleared-chat");
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("search");

    // Third Escape: dismisses window (Layer 3)
    expect(simulateEscape()).toBe("dismissed");
    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });
});
