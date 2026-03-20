import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useChatStore } from "../../stores/chatStore";

// Track listeners registered by listen(). Each event name maps to an array
// because the real Tauri API can have multiple listeners per event.
const mockListeners = new Map<string, ((event: { payload: unknown }) => void)[]>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: (event: { payload: unknown }) => void) => {
    const existing = mockListeners.get(event) ?? [];
    existing.push(callback);
    mockListeners.set(event, existing);
    const unlisten = () => {
      const cbs = mockListeners.get(event);
      if (cbs) {
        const idx = cbs.indexOf(callback);
        if (idx !== -1) cbs.splice(idx, 1);
        if (cbs.length === 0) mockListeners.delete(event);
      }
    };
    return Promise.resolve(unlisten);
  }),
}));

// Import after mocks are set up
import { useChat } from "../useChat";

function emitMockEvent(event: string, payload: unknown) {
  const listeners = mockListeners.get(event);
  if (listeners) {
    for (const listener of listeners) {
      listener({ payload });
    }
  }
}

beforeEach(() => {
  mockListeners.clear();
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    currentResponse: "",
    chatStatus: { connected: false, sessionId: null, repoPath: null },
  });
});

afterEach(() => {
  cleanup();
});

describe("useChat", () => {
  /** Render the hook and flush the async listener setup inside useEffect. */
  async function renderChatHook() {
    const result = renderHook(() => {
      useChat();
    });
    // useChat's useEffect calls `void setup()` which awaits listen() promises.
    // Flush the microtask queue so all listeners are registered.
    await act(async () => {
      await Promise.resolve();
    });
    return result;
  }

  it("registers listeners for chat:token, chat:done, chat:error", async () => {
    await renderChatHook();

    expect(mockListeners.has("chat:token")).toBe(true);
    expect(mockListeners.has("chat:done")).toBe(true);
    expect(mockListeners.has("chat:error")).toBe(true);
    expect(mockListeners.get("chat:token")?.length).toBe(1);
    expect(mockListeners.get("chat:done")?.length).toBe(1);
  });

  it("keeps one listener set across StrictMode-like remount", async () => {
    const first = await renderChatHook();
    expect(mockListeners.get("chat:token")?.length).toBe(1);

    first.unmount();
    expect(mockListeners.has("chat:token")).toBe(false);

    await renderChatHook();
    expect(mockListeners.get("chat:token")?.length).toBe(1);
  });

  it("chat:token event calls appendToken exactly once", async () => {
    await renderChatHook();

    act(() => {
      emitMockEvent("chat:token", "hello");
    });

    // CRITICAL: the token should appear exactly once, not doubled
    expect(useChatStore.getState().currentResponse).toBe("hello");
  });

  it("chat:done event calls finishResponse", async () => {
    await renderChatHook();

    // Simulate a stream in progress
    act(() => {
      useChatStore.setState({
        currentResponse: "complete answer",
        isStreaming: true,
      });
    });

    act(() => {
      emitMockEvent("chat:done", null);
    });

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "assistant", content: "complete answer" }]);
    expect(state.isStreaming).toBe(false);
    expect(state.currentResponse).toBe("");
  });

  it("chat:error event calls setError", async () => {
    await renderChatHook();

    act(() => {
      emitMockEvent("chat:error", "network failure");
    });

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "error", content: "network failure" }]);
    expect(state.isStreaming).toBe(false);
  });

  it("multiple rapid token events accumulate correctly", async () => {
    await renderChatHook();

    const tokens = ["Hello", " ", "world", "!", " 🎉"];
    act(() => {
      for (const token of tokens) {
        emitMockEvent("chat:token", token);
      }
    });

    // Must equal exact concatenation with no duplicates
    expect(useChatStore.getState().currentResponse).toBe("Hello world! 🎉");
  });

  it("cleanup unregisters all listeners", async () => {
    const hookResult = await renderChatHook();

    // Listeners should exist
    expect(mockListeners.has("chat:token")).toBe(true);

    // Unmount the hook
    hookResult.unmount();

    // All listeners should be cleaned up
    expect(mockListeners.has("chat:token")).toBe(false);
    expect(mockListeners.has("chat:done")).toBe(false);
    expect(mockListeners.has("chat:error")).toBe(false);
  });

  it("full stream simulation: setup → tokens → done → verify final message", async () => {
    await renderChatHook();

    // User sends a message (store action, not event-driven)
    act(() => {
      useChatStore.getState().addUserMessage("Tell me about Tauri");
    });

    // Simulate the backend streaming tokens
    act(() => {
      emitMockEvent("chat:token", "Tauri ");
      emitMockEvent("chat:token", "is ");
      emitMockEvent("chat:token", "a ");
      emitMockEvent("chat:token", "framework.");
    });

    expect(useChatStore.getState().currentResponse).toBe("Tauri is a framework.");
    expect(useChatStore.getState().isStreaming).toBe(true);

    // Backend signals stream complete
    act(() => {
      emitMockEvent("chat:done", null);
    });

    const state = useChatStore.getState();
    expect(state.messages).toEqual([
      { role: "user", content: "Tell me about Tauri" },
      { role: "assistant", content: "Tauri is a framework." },
    ]);
    expect(state.isStreaming).toBe(false);
    expect(state.currentResponse).toBe("");
  });
});
