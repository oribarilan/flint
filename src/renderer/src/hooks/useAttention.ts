import { useEffect } from "react";
import { useAttentionStore } from "../stores/attentionStore";

export function useAttention() {
  const { items, selectedIds, setItems, toggleSelect, clearSelection, getSelectedItems } =
    useAttentionStore();

  useEffect(() => {
    void window.flint?.getAttentionItems().then((raw) => {
      setItems(raw);
    });

    const unsub = window.flint?.onAttentionUpdate((raw) => {
      setItems(raw);
    });
    return () => {
      unsub?.();
    };
  }, [setItems]);

  return { items, selectedIds, toggleSelect, clearSelection, getSelectedItems };
}
