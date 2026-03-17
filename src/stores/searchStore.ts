import { create } from "zustand";
import type { ActiveCommand, KitAction, KitSearchResult } from "../kits/types";
import { isMac, isWindows } from "../lib/platform";

export type AppMode = "search" | "agent";

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
  activeCommand: ActiveCommand | null;
  /** Incremented to force a re-search with the same query. */
  searchVersion: number;

  // Action Panel state
  actionPanelOpen: boolean;
  actionPanelResult: KitSearchResult | null;
  actionFilterQuery: string;
  selectedActionIndex: number;
  armedActionIndex: number | null;

  toggleMode: () => void;
  setMode: (mode: AppMode) => void;
  setQuery: (query: string) => void;
  setResults: (results: KitSearchResult[]) => void;
  setSelectedIndex: (index: number) => void;
  moveSelection: (direction: "up" | "down") => void;
  activateCommand: (cmd: ActiveCommand) => void;
  deactivateCommand: () => void;
  clearSearch: () => void;

  // Action Panel methods
  openActionPanel: () => void;
  closeActionPanel: () => void;
  setActionFilterQuery: (query: string) => void;
  moveActionSelection: (direction: "up" | "down") => void;
  armAction: (index: number) => void;
  disarmAction: () => void;
  getFilteredActions: () => KitAction[];
  refreshSearch: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  mode: "search",
  query: "",
  results: [],
  selectedIndex: 0,
  isLoading: false,
  activeCommand: null,
  searchVersion: 0,

  // Action Panel defaults
  actionPanelOpen: false,
  actionPanelResult: null,
  actionFilterQuery: "",
  selectedActionIndex: 0,
  armedActionIndex: null,

  toggleMode: () => {
    set({ mode: get().mode === "search" ? "agent" : "search" });
  },

  setMode: (mode) => {
    set({ mode });
  },

  setQuery: (query) => {
    const state = get();
    if (state.actionPanelOpen) {
      set({ actionFilterQuery: query, selectedActionIndex: 0, armedActionIndex: null });
    } else {
      set({ query, selectedIndex: 0 });
    }
  },

  setResults: (results) => {
    set({ results, selectedIndex: 0 });
  },

  setSelectedIndex: (index) => {
    set({ selectedIndex: index });
  },

  moveSelection: (direction) => {
    const state = get();
    if (state.actionPanelOpen) {
      state.moveActionSelection(direction);
      return;
    }
    const { results, selectedIndex } = state;
    if (results.length === 0) return;

    const next =
      direction === "down"
        ? Math.min(selectedIndex + 1, results.length - 1)
        : Math.max(selectedIndex - 1, 0);

    set({ selectedIndex: next });
  },

  activateCommand: (cmd) => {
    set({ activeCommand: cmd, query: "", results: [], selectedIndex: 0 });
  },

  deactivateCommand: () => {
    set({ activeCommand: null, query: "", results: [], selectedIndex: 0 });
  },

  clearSearch: () => {
    set({
      mode: "search",
      query: "",
      results: [],
      selectedIndex: 0,
      isLoading: false,
      activeCommand: null,
      actionPanelOpen: false,
      actionPanelResult: null,
      actionFilterQuery: "",
      selectedActionIndex: 0,
      armedActionIndex: null,
    });
  },

  // ── Action Panel ─────────────────────────────────────────────

  openActionPanel: () => {
    const { results, selectedIndex } = get();
    const result = results[selectedIndex];
    if (!result) return;
    set({
      actionPanelOpen: true,
      actionPanelResult: result,
      actionFilterQuery: "",
      selectedActionIndex: 0,
      armedActionIndex: null,
    });
  },

  closeActionPanel: () => {
    set({
      actionPanelOpen: false,
      actionPanelResult: null,
      actionFilterQuery: "",
      selectedActionIndex: 0,
      armedActionIndex: null,
    });
  },

  setActionFilterQuery: (query) => {
    set({ actionFilterQuery: query, selectedActionIndex: 0, armedActionIndex: null });
  },

  moveActionSelection: (direction) => {
    const filtered = get().getFilteredActions();
    if (filtered.length === 0) return;

    const { selectedActionIndex } = get();
    const next =
      direction === "down"
        ? Math.min(selectedActionIndex + 1, filtered.length - 1)
        : Math.max(selectedActionIndex - 1, 0);

    set({ selectedActionIndex: next, armedActionIndex: null });
  },

  armAction: (index) => {
    set({ armedActionIndex: index });
  },

  disarmAction: () => {
    set({ armedActionIndex: null });
  },

  getFilteredActions: () => {
    const { actionPanelResult, actionFilterQuery } = get();
    if (!actionPanelResult) return [];
    if (!actionFilterQuery) return actionPanelResult.actions;
    const lower = actionFilterQuery.toLowerCase();
    return actionPanelResult.actions.filter((a) => getActionLabel(a).toLowerCase().includes(lower));
  },

  refreshSearch: () => {
    // Increment version to force the useSearch hook to re-run
    // even when the query hasn't changed (e.g., after a pin/delete).
    set({ searchVersion: get().searchVersion + 1 });
  },
}));

// ---------------------------------------------------------------------------
// Action helpers
// ---------------------------------------------------------------------------

/** Derive a human-readable label from a `KitAction` variant. */
export function getActionLabel(action: KitAction): string {
  switch (action.type) {
    case "Open":
      return "Open";
    case "Copy":
      return action.label ?? "Copy";
    case "OpenInEditor":
      return "Open in Editor";
    case "RevealInFileManager":
      if (isMac()) return "Reveal in Finder";
      if (isWindows()) return "Show in Explorer";
      return "Show in File Manager";
    case "CopyPath":
      return "Copy Path";
    case "CopyName":
      return "Copy Name";
    case "Delete":
      return "Delete";
    case "FocusWindow":
      return "Focus Window";
    case "OpenApp":
      return "Open App";
    case "Paste":
      return "Paste";
    case "ActivateCommand":
      return "Activate Command";
    case "Custom":
      return action.label;
  }
}

/** Whether an action requires the armed confirmation state. */
export function actionRequiresConfirmation(action: KitAction): boolean {
  if (action.type === "Delete") return true;
  if (action.type === "Custom" && action.requires_confirmation) return true;
  return false;
}
