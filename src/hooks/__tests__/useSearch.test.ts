import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import type { KitSearchResult } from "../../kits/types";

vi.mock("../../lib/commands", () => ({
  searchAll: vi.fn(),
  searchCommand: vi.fn(),
}));

import { searchAll, searchCommand } from "../../lib/commands";
import { useSearch } from "../useSearch";

const mockedSearchAll = vi.mocked(searchAll);
const mockedSearchCommand = vi.mocked(searchCommand);

const mockResults: KitSearchResult[] = [
  {
    kitId: "core",
    id: "1",
    title: "file1.txt",
    subtitle: "/tmp/file1.txt",
    kind: { type: "File" },
    actions: [{ type: "Open", target: "/tmp/file1.txt" }],
  },
  {
    kitId: "core",
    id: "2",
    title: "file2.txt",
    subtitle: "/tmp/file2.txt",
    kind: { type: "File" },
    actions: [{ type: "Open", target: "/tmp/file2.txt" }],
  },
];

function renderUseSearch() {
  return renderHook(() => {
    useSearch();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  useSearchStore.setState({
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
    activeCommand: null,
  });
  mockedSearchAll.mockReset();
  mockedSearchAll.mockResolvedValue([]);
  mockedSearchCommand.mockReset();
  mockedSearchCommand.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSearch", () => {
  it("should not search when query is shorter than 2 chars", async () => {
    useSearchStore.setState({ query: "a" });
    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockedSearchAll).not.toHaveBeenCalled();
  });

  it("should clear results when query drops below 2 chars", () => {
    useSearchStore.setState({
      query: "ab",
      results: mockResults,
    });
    const { rerender } = renderUseSearch();

    act(() => {
      useSearchStore.setState({ query: "a" });
    });
    rerender();

    expect(useSearchStore.getState().results).toEqual([]);
  });

  it("should call searchAll when query is 2+ chars", async () => {
    mockedSearchAll.mockResolvedValue(mockResults);
    useSearchStore.setState({ query: "te" });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockedSearchAll).toHaveBeenCalledWith("te");
    expect(useSearchStore.getState().results).toEqual(mockResults);
  });

  it("should debounce rapid query changes", async () => {
    mockedSearchAll.mockResolvedValue(mockResults);
    useSearchStore.setState({ query: "te" });
    const { rerender } = renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    // Change query before debounce fires
    act(() => {
      useSearchStore.setState({ query: "tes" });
    });
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });

    // Original "te" should not have fired since we changed query within 150ms
    expect(mockedSearchAll).not.toHaveBeenCalledWith("te");

    // Change again
    act(() => {
      useSearchStore.setState({ query: "test" });
    });
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Only the final query should fire
    expect(mockedSearchAll).toHaveBeenCalledWith("test");
    expect(mockedSearchAll).toHaveBeenCalledTimes(1);
  });

  it("should update results in store on success", async () => {
    mockedSearchAll.mockResolvedValue(mockResults);
    useSearchStore.setState({ query: "test" });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(useSearchStore.getState().results).toEqual(mockResults);
    expect(useSearchStore.getState().isLoading).toBe(false);
  });

  it("should handle search errors gracefully", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedSearchAll.mockRejectedValue(new Error("Network error"));
    useSearchStore.setState({ query: "test" });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(useSearchStore.getState().isLoading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith("Search failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should not update results if query changed during search", async () => {
    const staleResults: KitSearchResult[] = [
      {
        kitId: "core",
        id: "old",
        title: "old.txt",
        subtitle: "/old.txt",
        kind: { type: "File" },
        actions: [{ type: "Open", target: "/old.txt" }],
      },
    ];
    const freshResults: KitSearchResult[] = [
      {
        kitId: "core",
        id: "new",
        title: "new.txt",
        subtitle: "/new.txt",
        kind: { type: "File" },
        actions: [{ type: "Open", target: "/new.txt" }],
      },
    ];

    // First search resolves slowly, second resolves fast
    mockedSearchAll
      .mockImplementationOnce(
        () =>
          new Promise<KitSearchResult[]>((resolve) => {
            setTimeout(() => {
              resolve(staleResults);
            }, 200);
          }),
      )
      .mockImplementationOnce(() => Promise.resolve(freshResults));

    useSearchStore.setState({ query: "old" });
    const { rerender } = renderUseSearch();

    // Fire debounce for "old"
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Change query while "old" search is in flight
    act(() => {
      useSearchStore.setState({ query: "new" });
    });
    rerender();

    // Fire debounce for "new" and resolve all
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    // Results should be from the "new" query, not the stale "old" query
    expect(useSearchStore.getState().results).toEqual(freshResults);
  });

  it("should call searchCommand when activeCommand is set", async () => {
    const cmdResults: KitSearchResult[] = [
      {
        kitId: "calculator",
        id: "calc-result",
        title: "5",
        kind: { type: "File" },
        actions: [{ type: "Copy", text: "5" }],
      },
    ];
    mockedSearchCommand.mockResolvedValue(cmdResults);
    useSearchStore.setState({
      query: "2+3",
      activeCommand: { kitId: "calculator", commandId: "calculate", name: "Calculator" },
    });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockedSearchCommand).toHaveBeenCalledWith("calculator", "calculate", "2+3");
    expect(mockedSearchAll).not.toHaveBeenCalled();
    expect(useSearchStore.getState().results).toEqual(cmdResults);
  });

  it("should allow empty query when activeCommand is set", async () => {
    mockedSearchCommand.mockResolvedValue([]);
    useSearchStore.setState({
      query: "",
      activeCommand: { kitId: "calculator", commandId: "calculate", name: "Calculator" },
    });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // With active command, empty query is allowed (shows history)
    expect(mockedSearchCommand).toHaveBeenCalledWith("calculator", "calculate", "");
  });
});
