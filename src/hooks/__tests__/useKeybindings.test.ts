import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import { useChatStore } from "../../stores/chatStore";
import { useKeybindings } from "../useKeybindings";

vi.mock("../../lib/commands", () => ({
  hideWindow: vi.fn(() => Promise.resolve()),
  openFile: vi.fn(() => Promise.resolve()),
  openSettings: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/platform", () => ({
  isMac: vi.fn(() => false),
}));

import * as commands from "../../lib/commands";
import { isMac } from "../../lib/platform";
const mockIsMac = vi.mocked(isMac);

function createActions() {
  return {
    onToggleMode: vi.fn(),
    onFocusSearchBar: vi.fn(),
    onOpenResult: vi.fn(),
  };
}

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  mockIsMac.mockReturnValue(false);
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

describe("useKeybindings", () => {
  // ── Tab ────────────────────────────────────────────────────

  it("Tab calls onToggleMode", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Tab");

    expect(actions.onToggleMode).toHaveBeenCalledTimes(1);
  });

  it("Tab with modifier keys does not toggle mode", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Tab", { ctrlKey: true });
    fireKey("Tab", { metaKey: true });
    fireKey("Tab", { altKey: true });

    expect(actions.onToggleMode).not.toHaveBeenCalled();
  });

  // ── Escape ─────────────────────────────────────────────────

  it("Escape layer 1: clears input text", () => {
    useSearchStore.setState({ query: "hello", mode: "search" });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("search");
    expect(actions.onFocusSearchBar).toHaveBeenCalledTimes(1);
  });

  it("Escape layer 1: preserves chat mode when clearing input", () => {
    useSearchStore.setState({ query: "what is rust?", mode: "chat" });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("chat");
  });

  it("Escape layer 2: clears chat and stays in current mode", () => {
    useSearchStore.setState({ query: "", mode: "chat" });
    useChatStore.setState({
      messages: [{ role: "user", content: "hi" }],
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("chat");
    expect(actions.onFocusSearchBar).toHaveBeenCalledTimes(1);
  });

  it("Escape layer 2: clears stale chat messages while in search mode", () => {
    useSearchStore.setState({ query: "", mode: "search" });
    useChatStore.setState({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useChatStore.getState().messages).toEqual([]);
    expect(useSearchStore.getState().mode).toBe("search");
    expect(commands.hideWindow).not.toHaveBeenCalled();
  });

  it("Escape layer 3: dismisses window", () => {
    useSearchStore.setState({ query: "", mode: "search" });
    useChatStore.setState({ messages: [] });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
  });

  // ── Ctrl+HJKL vim arrows ──────────────────────────────────

  it("Ctrl+J dispatches ArrowDown", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("j", { ctrlKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowDown");
    expect(arrowEvent).toBeTruthy();
  });

  it("Ctrl+K dispatches ArrowUp", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("k", { ctrlKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowUp");
    expect(arrowEvent).toBeTruthy();
  });

  it("Ctrl+H dispatches ArrowLeft", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("h", { ctrlKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowLeft");
    expect(arrowEvent).toBeTruthy();
  });

  it("Ctrl+L dispatches ArrowRight", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("l", { ctrlKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowRight");
    expect(arrowEvent).toBeTruthy();
  });

  it("Ctrl+Shift+J does not remap (extra modifier blocks vim arrows)", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("j", { ctrlKey: true, shiftKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowDown");
    expect(arrowEvent).toBeUndefined();
  });

  it("Ctrl+Alt+J does not remap", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("j", { ctrlKey: true, altKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowDown");
    expect(arrowEvent).toBeUndefined();
  });

  it("Ctrl+Meta+H does not remap", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    const events: KeyboardEvent[] = [];
    const listener = (e: Event) => {
      events.push(e as KeyboardEvent);
    };
    window.addEventListener("keydown", listener);

    fireKey("h", { ctrlKey: true, metaKey: true });

    window.removeEventListener("keydown", listener);

    const arrowEvent = events.find((e) => e.key === "ArrowLeft");
    expect(arrowEvent).toBeUndefined();
  });

  // ── CmdOrCtrl+, (settings) ────────────────────────────────

  it("CmdOrCtrl+, opens settings on non-Mac (ctrlKey)", () => {
    mockIsMac.mockReturnValue(false);
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey(",", { ctrlKey: true });

    expect(commands.openSettings).toHaveBeenCalledTimes(1);
  });

  it("CmdOrCtrl+, opens settings on Mac (metaKey)", () => {
    mockIsMac.mockReturnValue(true);
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey(",", { metaKey: true });

    expect(commands.openSettings).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+, does not open settings on Mac", () => {
    mockIsMac.mockReturnValue(true);
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey(",", { ctrlKey: true });

    expect(commands.openSettings).not.toHaveBeenCalled();
  });

  // ── CmdOrCtrl+1..9 (open result) ──────────────────────────

  it("CmdOrCtrl+1..9 calls onOpenResult with correct index (non-Mac)", () => {
    mockIsMac.mockReturnValue(false);
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("1", { ctrlKey: true });
    expect(actions.onOpenResult).toHaveBeenCalledWith(0);

    fireKey("5", { ctrlKey: true });
    expect(actions.onOpenResult).toHaveBeenCalledWith(4);

    fireKey("9", { ctrlKey: true });
    expect(actions.onOpenResult).toHaveBeenCalledWith(8);
  });

  it("CmdOrCtrl+1..9 calls onOpenResult on Mac (metaKey)", () => {
    mockIsMac.mockReturnValue(true);
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("1", { metaKey: true });
    expect(actions.onOpenResult).toHaveBeenCalledWith(0);

    fireKey("3", { metaKey: true });
    expect(actions.onOpenResult).toHaveBeenCalledWith(2);
  });

  it("CmdOrCtrl+0 does not trigger onOpenResult", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("0", { ctrlKey: true });

    expect(actions.onOpenResult).not.toHaveBeenCalled();
  });

  it("CmdOrCtrl+Shift+1 does not trigger onOpenResult", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("1", { ctrlKey: true, shiftKey: true });

    expect(actions.onOpenResult).not.toHaveBeenCalled();
  });

  it("CmdOrCtrl+Alt+1 does not trigger onOpenResult", () => {
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("1", { ctrlKey: true, altKey: true });

    expect(actions.onOpenResult).not.toHaveBeenCalled();
  });

  // ── Cleanup ────────────────────────────────────────────────

  it("cleans up event listener on unmount", () => {
    const actions = createActions();
    const { unmount } = renderHook(() => {
      useKeybindings(actions);
    });

    unmount();

    fireKey("Tab");
    expect(actions.onToggleMode).not.toHaveBeenCalled();
  });
});
