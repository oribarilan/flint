import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchStore, type SearchResult } from "../../stores/searchStore";

vi.mock("../../lib/commands", () => ({
  searchFiles: vi.fn(),
}));

import { searchFiles } from "../../lib/commands";
import { useSearch } from "../useSearch";

const mockedSearchFiles = vi.mocked(searchFiles);

const mockResults: SearchResult[] = [
  { id: "1", name: "file1.txt", path: "/tmp/file1.txt", kind: "file" },
  { id: "2", name: "file2.txt", path: "/tmp/file2.txt", kind: "file" },
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
  });
  mockedSearchFiles.mockReset();
  mockedSearchFiles.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSearch", () => {
  it("should not search when query is shorter than 2 chars", async () => {
    useSearchStore.setState({ query: "a" });
    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockedSearchFiles).not.toHaveBeenCalled();
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

  it("should call searchFiles when query is 2+ chars", async () => {
    mockedSearchFiles.mockResolvedValue(mockResults);
    useSearchStore.setState({ query: "te" });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(mockedSearchFiles).toHaveBeenCalledWith("te");
    expect(useSearchStore.getState().results).toEqual(mockResults);
  });

  it("should debounce rapid query changes", async () => {
    mockedSearchFiles.mockResolvedValue(mockResults);
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

    // Original "te" should not have fired since we changed query within 50ms
    expect(mockedSearchFiles).not.toHaveBeenCalledWith("te");

    // Change again
    act(() => {
      useSearchStore.setState({ query: "test" });
    });
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // Only the final query should fire
    expect(mockedSearchFiles).toHaveBeenCalledWith("test");
    expect(mockedSearchFiles).toHaveBeenCalledTimes(1);
  });

  it("should update results in store on success", async () => {
    mockedSearchFiles.mockResolvedValue(mockResults);
    useSearchStore.setState({ query: "test" });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(useSearchStore.getState().results).toEqual(mockResults);
    expect(useSearchStore.getState().isLoading).toBe(false);
  });

  it("should handle search errors gracefully", async () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedSearchFiles.mockRejectedValue(new Error("Network error"));
    useSearchStore.setState({ query: "test" });

    renderUseSearch();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(useSearchStore.getState().isLoading).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith("Search failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should not update results if query changed during search", async () => {
    const staleResults: SearchResult[] = [
      { id: "old", name: "old.txt", path: "/old.txt", kind: "file" },
    ];
    const freshResults: SearchResult[] = [
      { id: "new", name: "new.txt", path: "/new.txt", kind: "file" },
    ];

    // First search resolves slowly, second resolves fast
    mockedSearchFiles
      .mockImplementationOnce(
        () =>
          new Promise<SearchResult[]>((resolve) => {
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
      await vi.advanceTimersByTimeAsync(50);
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
});
