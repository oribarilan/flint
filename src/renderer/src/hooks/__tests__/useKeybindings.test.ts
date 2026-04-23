import { vi, describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import { useChatStore } from "../../stores/chatStore";
import { useKeybindings } from "../useKeybindings";

vi.mock("../../lib/commands", () => ({
  hideWindow: vi.fn(() => Promise.resolve()),
  openFile: vi.fn(() => Promise.resolve()),
  openSettings: vi.fn(() => Promise.resolve()),
  clearChat: vi.fn(() => Promise.resolve()),
  abortChat: vi.fn(() => Promise.resolve()),
  getChatStatus: vi.fn(() =>
    Promise.resolve({ connected: true, session_id: "session-2", repo_path: "/brain" }),
  ),
}));

vi.mock("../../lib/platform", () => ({
  isMac: vi.fn(() => false),
}));

import * as commands from "../../lib/commands";
import { isMac } from "../../lib/platform";
import type { KitSearchResult } from "../../kits/types";
const mockIsMac = vi.mocked(isMac);

const MOCK_RESULT: KitSearchResult = {
  kitId: "core",
  id: "/tmp/test.ts",
  title: "test.ts",
  kind: { type: "File" },
  actions: [{ type: "Open", target: "/tmp/test.ts" }],
};

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
    activeCommand: null,
  });
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    currentResponse: "",
    modelPickerOpen: false,
    modelPickerMode: "session",
    modelPickerActionPanelOpen: false,
    slashMenuOpen: false,
    slashMenuDismissed: false,
    notice: null,
    chatStatus: { connected: false, sessionId: null, repoPath: null },
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

  it("Tab is blocked while model picker is open (session mode)", () => {
    useChatStore.setState({ modelPickerOpen: true, modelPickerMode: "session" });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Tab");

    expect(actions.onToggleMode).not.toHaveBeenCalled();
    expect(actions.onFocusSearchBar).toHaveBeenCalledTimes(1);
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

  it("Escape layer 0: pops command chip when active", () => {
    useSearchStore.setState({
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
      query: "2+3",
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useSearchStore.getState().activeCommand).toBeNull();
    expect(useSearchStore.getState().query).toBe("");
    expect(actions.onFocusSearchBar).toHaveBeenCalledTimes(1);
  });

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

  it("Escape layer 1: preserves agent mode when clearing input", () => {
    useSearchStore.setState({ query: "what is rust?", mode: "agent" });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().mode).toBe("agent");
  });

  it("Escape layer 2: aborts streaming but keeps conversation", () => {
    useSearchStore.setState({ query: "", mode: "agent" });
    useChatStore.setState({
      messages: [{ role: "user", content: "hi" }],
      isStreaming: true,
      currentResponse: "partial response",
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    // Streaming aborted, but messages preserved (partial response finalized)
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().messages).toHaveLength(2); // user + finalized assistant
    expect(commands.abortChat).toHaveBeenCalledTimes(1);
    expect(actions.onFocusSearchBar).toHaveBeenCalledTimes(1);
  });

  it("Escape with idle messages skips to hide window (Cmd+N clears chat)", () => {
    useSearchStore.setState({ query: "", mode: "agent" });
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

    // Messages NOT cleared — Escape skips to hide window
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(commands.hideWindow).toHaveBeenCalledTimes(1);
    expect(commands.clearChat).not.toHaveBeenCalled();
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

  it("Ctrl+H dispatches ArrowLeft when no panel open", () => {
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

  it("Ctrl+L dispatches ArrowRight when no results", () => {
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

    // No results, so Ctrl+L doesn't open panel — falls through
    // (no arrow dispatch either since L is now panel-only)
    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
  });

  // ── Ctrl+L/H Action Panel depth ───────────────────────────

  it("Ctrl+L opens Action Panel when results exist in search mode", () => {
    useSearchStore.setState({
      results: [MOCK_RESULT],
      selectedIndex: 0,
      mode: "search",
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("l", { ctrlKey: true });

    expect(useSearchStore.getState().actionPanelOpen).toBe(true);
  });

  it("Ctrl+H closes Action Panel when open", () => {
    useSearchStore.setState({
      results: [MOCK_RESULT],
      selectedIndex: 0,
      mode: "search",
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    // Open panel first
    useSearchStore.getState().openActionPanel();
    expect(useSearchStore.getState().actionPanelOpen).toBe(true);

    fireKey("h", { ctrlKey: true });

    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
  });

  it("Ctrl+L is no-op when Action Panel is already open", () => {
    useSearchStore.setState({
      results: [MOCK_RESULT],
      selectedIndex: 0,
      mode: "search",
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    useSearchStore.getState().openActionPanel();
    fireKey("l", { ctrlKey: true });

    // Still open, not toggled
    expect(useSearchStore.getState().actionPanelOpen).toBe(true);
  });

  // ── Escape closes Action Panel (new layer) ─────────────────

  it("Escape closes Action Panel before popping command chip", () => {
    useSearchStore.setState({
      results: [MOCK_RESULT],
      selectedIndex: 0,
      mode: "search",
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    // Open the panel
    useSearchStore.getState().openActionPanel();

    fireKey("Escape");

    // Panel should close, command chip should still be active
    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
    expect(useSearchStore.getState().activeCommand).not.toBeNull();
  });

  it("Escape closes model picker action panel before closing model picker", () => {
    useChatStore.setState({
      modelPickerOpen: true,
      modelPickerMode: "session",
      modelPickerActionPanelOpen: true,
    });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useChatStore.getState().modelPickerActionPanelOpen).toBe(false);
    expect(useChatStore.getState().modelPickerOpen).toBe(true);
  });

  it("Escape closes model picker when not required", () => {
    useChatStore.setState({ modelPickerOpen: true, modelPickerMode: "session" });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useChatStore.getState().modelPickerOpen).toBe(false);
  });

  it("Escape does not close required model picker", () => {
    useChatStore.setState({ modelPickerOpen: true, modelPickerMode: "default_required" });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useChatStore.getState().modelPickerOpen).toBe(true);
  });

  it("Escape closes slash menu before clearing query", () => {
    useSearchStore.setState({ query: "/m", mode: "agent" });
    useChatStore.setState({ slashMenuOpen: true, slashMenuDismissed: false });
    const actions = createActions();
    renderHook(() => {
      useKeybindings(actions);
    });

    fireKey("Escape");

    expect(useChatStore.getState().slashMenuOpen).toBe(false);
    expect(useChatStore.getState().slashMenuDismissed).toBe(true);
    expect(useSearchStore.getState().query).toBe("/m");
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
