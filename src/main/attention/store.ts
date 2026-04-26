import type { AttentionItem } from "../types";

export interface AttentionStore {
  getAll(): AttentionItem[];
  setItems(items: AttentionItem[]): void;
  findById(id: string): AttentionItem | undefined;
}

export function createAttentionStore(): AttentionStore {
  let items: AttentionItem[] = [];

  return {
    getAll: () => items,
    setItems: (newItems) => {
      items = newItems;
    },
    findById: (id) => items.find((item) => item.id === id),
  };
}
