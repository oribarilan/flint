import { describe, it, expect, beforeEach } from "vitest";
import { useAttentionStore } from "../attentionStore";

describe("attentionStore", () => {
  beforeEach(() => {
    useAttentionStore.setState({ items: [], selectedIds: new Set() });
  });

  it("starts empty", () => {
    const state = useAttentionStore.getState();
    expect(state.items).toEqual([]);
    expect(state.selectedIds.size).toBe(0);
  });

  it("setItems replaces all items", () => {
    useAttentionStore
      .getState()
      .setItems([{ id: "1", icon: "calendar", title: "Test", description: "Desc", metadata: {} }]);
    expect(useAttentionStore.getState().items).toHaveLength(1);
  });

  it("toggleSelect adds and removes", () => {
    useAttentionStore.getState().toggleSelect("a");
    expect(useAttentionStore.getState().selectedIds.has("a")).toBe(true);
    useAttentionStore.getState().toggleSelect("a");
    expect(useAttentionStore.getState().selectedIds.has("a")).toBe(false);
  });

  it("clearSelection empties selectedIds", () => {
    useAttentionStore.getState().toggleSelect("a");
    useAttentionStore.getState().toggleSelect("b");
    useAttentionStore.getState().clearSelection();
    expect(useAttentionStore.getState().selectedIds.size).toBe(0);
  });

  it("getSelectedItems returns only selected", () => {
    useAttentionStore.getState().setItems([
      { id: "a", icon: "calendar", title: "A", description: "", metadata: {} },
      { id: "b", icon: "message-circle", title: "B", description: "", metadata: {} },
    ]);
    useAttentionStore.getState().toggleSelect("b");
    expect(useAttentionStore.getState().getSelectedItems()).toHaveLength(1);
    expect(useAttentionStore.getState().getSelectedItems()[0].id).toBe("b");
  });
});
