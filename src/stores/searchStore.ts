import { create } from "zustand";

export interface SearchResult {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory" | "application";
}

interface SearchState {
  query: string;
  results: SearchResult[];
  selectedIndex: number;
  isLoading: boolean;
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setSelectedIndex: (index: number) => void;
  moveSelection: (direction: "up" | "down") => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  results: [],
  selectedIndex: 0,
  isLoading: false,

  setQuery: (query) => {
    set({ query, selectedIndex: 0 });
  },

  setResults: (results) => {
    set({ results, selectedIndex: 0 });
  },

  setSelectedIndex: (index) => {
    set({ selectedIndex: index });
  },

  moveSelection: (direction) => {
    const { results, selectedIndex } = get();
    if (results.length === 0) return;

    const next =
      direction === "down"
        ? Math.min(selectedIndex + 1, results.length - 1)
        : Math.max(selectedIndex - 1, 0);

    set({ selectedIndex: next });
  },

  clearSearch: () => {
    set({ query: "", results: [], selectedIndex: 0, isLoading: false });
  },
}));
