import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSearchStore } from "../../stores/searchStore";
import { useSessionMonitor } from "../useSessionMonitor";

const listeners = new Map<string, ((payload: unknown) => void)[]>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: (e: { payload: unknown }) => void) => {
    const wrapped = (payload: unknown) => {
      cb({ payload });
    };
    const arr = listeners.get(event) ?? [];
    arr.push(wrapped);
    listeners.set(event, arr);
    return Promise.resolve(() => {
      const cur = listeners.get(event) ?? [];
      listeners.set(
        event,
        cur.filter((fn) => fn !== wrapped),
      );
    });
  }),
}));

function emit(event: string, payload: unknown): void {
  const arr = listeners.get(event) ?? [];
  for (const fn of arr) fn(payload);
}

describe("useSessionMonitor", () => {
  beforeEach(() => {
    listeners.clear();
    useSearchStore.setState({
      mode: "search",
      query: "",
      results: [],
      selectedIndex: 0,
      isLoading: false,
      activeCommand: null,
      searchVersion: 0,
      actionPanelOpen: false,
      actionPanelResult: null,
      actionFilterQuery: "",
      selectedActionIndex: 0,
      armedActionIndex: null,
    });
  });

  it("refreshes search when sessions command is active", async () => {
    renderHook(() => {
      useSessionMonitor();
    });

    // wait for async listen registration
    await act(async () => {
      await Promise.resolve();
    });

    useSearchStore.setState({
      activeCommand: { kitId: "sessions", commandId: "sessions", name: "Sessions" },
      searchVersion: 0,
    });

    emit("monitor:session_update", { serverId: "s1", sessionId: "a", status: "working" });
    expect(useSearchStore.getState().searchVersion).toBe(1);
  });

  it("does not refresh search when another command is active", async () => {
    renderHook(() => {
      useSessionMonitor();
    });

    await act(async () => {
      await Promise.resolve();
    });

    useSearchStore.setState({
      activeCommand: { kitId: "calculator", commandId: "calculate", name: "Calculator" },
      searchVersion: 2,
    });

    emit("monitor:session_update", { serverId: "s1", sessionId: "a", status: "working" });
    expect(useSearchStore.getState().searchVersion).toBe(2);
  });
});
