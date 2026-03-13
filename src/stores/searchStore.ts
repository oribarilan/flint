import { create } from "zustand";
import type { KitSearchResult } from "../kits/types";

export type AppMode = "search" | "chat";

/** @deprecated Use KitSearchResult instead. Kept for backward compatibility. */
export interface SearchResult {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory" | "application";
}

interface SearchState {
  mode: AppMode;
  query: string;
  results: KitSearchResult[];
  selectedIndex: number;
  isLoading: boolean;
  toggleMode: () => void;
  setMode: (mode: AppMode) => void;
  setQuery: (query: string) => void;
  setResults: (results: KitSearchResult[]) => void;
  setSelectedIndex: (index: number) => void;
  moveSelection: (direction: "up" | "down") => void;
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  mode: "search",
  query: "",
  results: [],
  selectedIndex: 0,
  isLoading: false,

  toggleMode: () => {
    set({ mode: get().mode === "search" ? "chat" : "search" });
  },

  setMode: (mode) => {
    set({ mode });
  },

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
    set({ mode: "search", query: "", results: [], selectedIndex: 0, isLoading: false });
  },
}));
