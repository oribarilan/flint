import { describe, it, expect, beforeEach } from "vitest";
import {
  useSearchStore,
  getActionLabel,
  actionRequiresConfirmation,
} from "../../stores/searchStore";
import type { KitSearchResult } from "../../kits/types";

const FILE_RESULT: KitSearchResult = {
  kitId: "core",
  id: "/tmp/hello.ts",
  title: "hello.ts",
  subtitle: "/tmp/hello.ts",
  kind: { type: "File" },
  actions: [
    { type: "Open", target: "/tmp/hello.ts" },
    { type: "OpenInEditor", target: "/tmp/hello.ts" },
    { type: "RevealInFileManager", target: "/tmp/hello.ts" },
    { type: "CopyPath", path: "/tmp/hello.ts" },
    { type: "CopyName", name: "hello.ts" },
    { type: "Delete", target: "/tmp/hello.ts" },
  ],
};

beforeEach(() => {
  useSearchStore.setState({
    query: "hello",
    results: [FILE_RESULT],
    selectedIndex: 0,
    isLoading: false,
    activeCommand: null,
    actionPanelOpen: false,
    actionPanelResult: null,
    actionFilterQuery: "",
    selectedActionIndex: 0,
    armedActionIndex: null,
    mode: "search",
  });
});

describe("Action Panel store state", () => {
  it("opens the action panel for the selected result", () => {
    useSearchStore.getState().openActionPanel();
    const state = useSearchStore.getState();
    expect(state.actionPanelOpen).toBe(true);
    expect(state.actionPanelResult).toEqual(FILE_RESULT);
    expect(state.query).toBe("hello"); // query preserved
    expect(state.selectedActionIndex).toBe(0);
  });

  it("closes the action panel and restores the query", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().closeActionPanel();
    const state = useSearchStore.getState();
    expect(state.actionPanelOpen).toBe(false);
    expect(state.actionPanelResult).toBeNull();
    // Query was never changed — it stays as-is
    expect(state.query).toBe("hello");
  });

  it("preserves selectedIndex when closing the action panel", () => {
    const results = [FILE_RESULT, { ...FILE_RESULT, id: "2" }, { ...FILE_RESULT, id: "3" }];
    useSearchStore.setState({ selectedIndex: 2, results });
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().closeActionPanel();
    expect(useSearchStore.getState().selectedIndex).toBe(2);
  });

  it("preserves query unchanged while action panel is open", () => {
    useSearchStore.getState().openActionPanel();
    // query should still be "hello" — not cleared
    expect(useSearchStore.getState().query).toBe("hello");
  });

  it("does nothing when opening with no results", () => {
    useSearchStore.setState({ results: [] });
    useSearchStore.getState().openActionPanel();
    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
  });

  it("filters actions by label", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.setState({ actionFilterQuery: "copy" });
    const filtered = useSearchStore.getState().getFilteredActions();
    expect(filtered.length).toBe(2);
    expect(filtered[0]?.type).toBe("CopyPath");
    expect(filtered[1]?.type).toBe("CopyName");
  });

  it("returns all actions when filter is empty", () => {
    useSearchStore.getState().openActionPanel();
    const filtered = useSearchStore.getState().getFilteredActions();
    expect(filtered.length).toBe(6);
  });

  it("moves action selection up and down", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().moveActionSelection("down");
    expect(useSearchStore.getState().selectedActionIndex).toBe(1);
    useSearchStore.getState().moveActionSelection("down");
    expect(useSearchStore.getState().selectedActionIndex).toBe(2);
    useSearchStore.getState().moveActionSelection("up");
    expect(useSearchStore.getState().selectedActionIndex).toBe(1);
  });

  it("clamps action selection at bounds", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().moveActionSelection("up");
    expect(useSearchStore.getState().selectedActionIndex).toBe(0);
  });

  it("arms and disarms an action", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().armAction(5);
    expect(useSearchStore.getState().armedActionIndex).toBe(5);
    useSearchStore.getState().disarmAction();
    expect(useSearchStore.getState().armedActionIndex).toBeNull();
  });

  it("disarms when navigating to a different action", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().armAction(0);
    useSearchStore.getState().moveActionSelection("down");
    expect(useSearchStore.getState().armedActionIndex).toBeNull();
  });

  it("setQuery routes to actionFilterQuery when panel is open", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().setQuery("del");
    const state = useSearchStore.getState();
    expect(state.actionFilterQuery).toBe("del");
    // query is preserved (not cleared when panel opens)
    expect(state.query).toBe("hello");
  });

  it("clearSearch resets action panel state", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().clearSearch();
    const state = useSearchStore.getState();
    expect(state.actionPanelOpen).toBe(false);
    expect(state.actionPanelResult).toBeNull();
  });

  it("moveSelection delegates to moveActionSelection when panel is open", () => {
    useSearchStore.getState().openActionPanel();
    useSearchStore.getState().moveSelection("down");
    expect(useSearchStore.getState().selectedActionIndex).toBe(1);
  });
});

describe("getActionLabel", () => {
  it("returns correct labels for all action types", () => {
    expect(getActionLabel({ type: "Open", target: "" })).toBe("Open");
    expect(getActionLabel({ type: "OpenInEditor", target: "" })).toBe("Open in Editor");
    // jsdom is neither Mac nor Windows, so falls through to Linux label
    expect(getActionLabel({ type: "RevealInFileManager", target: "" })).toBe(
      "Show in File Manager",
    );
    expect(getActionLabel({ type: "CopyPath", path: "" })).toBe("Copy Path");
    expect(getActionLabel({ type: "CopyName", name: "" })).toBe("Copy Name");
    expect(getActionLabel({ type: "Delete", target: "" })).toBe("Delete");
    expect(getActionLabel({ type: "Custom", id: "x", label: "My Action" })).toBe("My Action");
  });
});

describe("actionRequiresConfirmation", () => {
  it("returns true for Delete", () => {
    expect(actionRequiresConfirmation({ type: "Delete", target: "" })).toBe(true);
  });

  it("returns true for Custom with requires_confirmation", () => {
    expect(
      actionRequiresConfirmation({
        type: "Custom",
        id: "x",
        label: "X",
        requires_confirmation: true,
      }),
    ).toBe(true);
  });

  it("returns false for Open", () => {
    expect(actionRequiresConfirmation({ type: "Open", target: "" })).toBe(false);
  });

  it("returns false for Custom without requires_confirmation", () => {
    expect(actionRequiresConfirmation({ type: "Custom", id: "x", label: "X" })).toBe(false);
  });
});
