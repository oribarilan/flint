import { describe, it, expect, beforeEach } from "vitest";
import { useSearchStore } from "../searchStore";
import type { KitSearchResult } from "../../kits/types";

const mockResults: KitSearchResult[] = [
  {
    kitId: "core",
    id: "1",
    title: "file1.txt",
    subtitle: "/tmp/file1.txt",
    icon: { type: "Named", value: "file" },
    actions: [{ type: "Open", target: "/tmp/file1.txt" }],
  },
  {
    kitId: "core",
    id: "2",
    title: "file2.txt",
    subtitle: "/tmp/file2.txt",
    icon: { type: "Named", value: "file" },
    actions: [{ type: "Open", target: "/tmp/file2.txt" }],
  },
  {
    kitId: "core",
    id: "3",
    title: "Apps",
    subtitle: "/Applications",
    icon: { type: "Named", value: "directory" },
    actions: [{ type: "Open", target: "/Applications" }],
  },
];

beforeEach(() => {
  useSearchStore.setState({
    mode: "search",
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
  });
});

describe("searchStore", () => {
  it("setQuery updates query and resets selectedIndex", () => {
    useSearchStore.setState({ selectedIndex: 3 });
    useSearchStore.getState().setQuery("hello");

    const state = useSearchStore.getState();
    expect(state.query).toBe("hello");
    expect(state.selectedIndex).toBe(0);
  });

  it("setResults updates results and resets selectedIndex", () => {
    useSearchStore.setState({ selectedIndex: 2 });
    useSearchStore.getState().setResults(mockResults);

    const state = useSearchStore.getState();
    expect(state.results).toEqual(mockResults);
    expect(state.selectedIndex).toBe(0);
  });

  it("moveSelection down increments index", () => {
    useSearchStore.setState({ results: mockResults, selectedIndex: 0 });
    useSearchStore.getState().moveSelection("down");

    expect(useSearchStore.getState().selectedIndex).toBe(1);
  });

  it("moveSelection up decrements index", () => {
    useSearchStore.setState({ results: mockResults, selectedIndex: 2 });
    useSearchStore.getState().moveSelection("up");

    expect(useSearchStore.getState().selectedIndex).toBe(1);
  });

  it("moveSelection down does not exceed results length", () => {
    useSearchStore.setState({
      results: mockResults,
      selectedIndex: mockResults.length - 1,
    });
    useSearchStore.getState().moveSelection("down");

    expect(useSearchStore.getState().selectedIndex).toBe(mockResults.length - 1);
  });

  it("moveSelection up does not go below zero", () => {
    useSearchStore.setState({ results: mockResults, selectedIndex: 0 });
    useSearchStore.getState().moveSelection("up");

    expect(useSearchStore.getState().selectedIndex).toBe(0);
  });

  it("moveSelection with empty results does nothing", () => {
    useSearchStore.setState({ results: [], selectedIndex: 0 });
    useSearchStore.getState().moveSelection("down");

    expect(useSearchStore.getState().selectedIndex).toBe(0);
  });

  it("clearSearch resets all state including mode", () => {
    useSearchStore.setState({
      mode: "chat",
      query: "test",
      results: mockResults,
      selectedIndex: 2,
      isLoading: true,
    });
    useSearchStore.getState().clearSearch();

    const state = useSearchStore.getState();
    expect(state.mode).toBe("search");
    expect(state.query).toBe("");
    expect(state.results).toEqual([]);
    expect(state.selectedIndex).toBe(0);
    expect(state.isLoading).toBe(false);
  });

  it("setSelectedIndex updates index", () => {
    useSearchStore.getState().setSelectedIndex(5);

    expect(useSearchStore.getState().selectedIndex).toBe(5);
  });

  it("toggleMode switches from search to chat", () => {
    expect(useSearchStore.getState().mode).toBe("search");
    useSearchStore.getState().toggleMode();

    expect(useSearchStore.getState().mode).toBe("chat");
  });

  it("toggleMode switches from chat to search", () => {
    useSearchStore.setState({ mode: "chat" });
    useSearchStore.getState().toggleMode();

    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("setMode sets mode directly", () => {
    useSearchStore.getState().setMode("chat");
    expect(useSearchStore.getState().mode).toBe("chat");

    useSearchStore.getState().setMode("search");
    expect(useSearchStore.getState().mode).toBe("search");
  });

  it("defaults to search mode", () => {
    expect(useSearchStore.getState().mode).toBe("search");
  });
});
