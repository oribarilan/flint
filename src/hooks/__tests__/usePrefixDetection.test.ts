import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";

vi.mock("../../lib/commands", () => ({
  getKitManifests: vi.fn(),
}));

import { getKitManifests } from "../../lib/commands";
import { usePrefixDetection } from "../usePrefixDetection";

const mockedGetKitManifests = vi.mocked(getKitManifests);

const mockManifests = [
  {
    id: "calculator",
    name: "Calculator",
    description: "Evaluate math",
    icon: { type: "Emoji" as const, value: "🧮" },
    enabled: true,
    commands: [
      {
        id: "calculate",
        name: "Calculator",
        description: "Evaluate math expressions",
        mode: "InputResults" as const,
        enabled: true,
        default_prefix: "=",
        effective_prefix: "=",
        effective_hotkey: null,
      },
    ],
  },
];

beforeEach(() => {
  useSearchStore.setState({
    mode: "search",
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
    activeCommand: null,
  });
  mockedGetKitManifests.mockResolvedValue(mockManifests);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePrefixDetection", () => {
  it("activates chip when query matches prefix + space", async () => {
    renderHook(() => {
      usePrefixDetection();
    });

    // Wait for manifests to load
    await act(async () => {
      await Promise.resolve();
    });

    // Type "= " (prefix + space)
    act(() => {
      useSearchStore.setState({ query: "= " });
    });

    const state = useSearchStore.getState();
    expect(state.activeCommand).toEqual({
      kitId: "calculator",
      commandId: "calculate",
      name: "Calculator",
    });
    expect(state.query).toBe("");
  });

  it("preserves remainder text after prefix + space", async () => {
    renderHook(() => {
      usePrefixDetection();
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useSearchStore.setState({ query: "= 2+3" });
    });

    const state = useSearchStore.getState();
    expect(state.activeCommand).not.toBeNull();
    expect(state.query).toBe("2+3");
  });

  it("activates chip even when query was set before manifests loaded", async () => {
    // Simulate slow manifest load — user types before manifests arrive
    let resolveManifests!: (value: typeof mockManifests) => void;
    mockedGetKitManifests.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveManifests = resolve;
        }),
    );

    renderHook(() => {
      usePrefixDetection();
    });

    // User types "= " BEFORE manifests have loaded
    act(() => {
      useSearchStore.setState({ query: "= " });
    });

    // Chip should NOT be active yet (no prefixes loaded)
    expect(useSearchStore.getState().activeCommand).toBeNull();

    // Now manifests finish loading
    await act(async () => {
      resolveManifests(mockManifests);
      await Promise.resolve();
    });

    // Chip SHOULD now be active — the hook should re-check the query
    const state = useSearchStore.getState();
    expect(state.activeCommand).toEqual({
      kitId: "calculator",
      commandId: "calculate",
      name: "Calculator",
    });
  });

  it("does not activate for prefix without trailing space", async () => {
    renderHook(() => {
      usePrefixDetection();
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useSearchStore.setState({ query: "=2+3" });
    });

    expect(useSearchStore.getState().activeCommand).toBeNull();
  });

  it("does not activate when a command is already active", async () => {
    useSearchStore.setState({
      activeCommand: { kitId: "other", commandId: "other", name: "Other" },
    });

    renderHook(() => {
      usePrefixDetection();
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useSearchStore.setState({ query: "= test" });
    });

    // Should keep the existing active command, not switch
    expect(useSearchStore.getState().activeCommand?.kitId).toBe("other");
  });

  it("handles manifests load failure gracefully", async () => {
    mockedGetKitManifests.mockRejectedValue(new Error("Network error"));

    renderHook(() => {
      usePrefixDetection();
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Should not crash, just no prefix detection
    act(() => {
      useSearchStore.setState({ query: "= test" });
    });

    expect(useSearchStore.getState().activeCommand).toBeNull();
  });

  it("does not activate prefix for disabled kits", async () => {
    const firstManifest = mockManifests[0];
    if (!firstManifest) throw new Error("Expected mockManifests[0] to exist");
    const disabledKit = { ...firstManifest, enabled: false };
    mockedGetKitManifests.mockResolvedValue([disabledKit]);

    renderHook(() => {
      usePrefixDetection();
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useSearchStore.setState({ query: "= 2+3" });
    });

    expect(useSearchStore.getState().activeCommand).toBeNull();
  });
});
