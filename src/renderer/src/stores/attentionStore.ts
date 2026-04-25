import { create } from 'zustand'
import type { AttentionItem } from '../../../main/types'

interface AttentionState {
  items: AttentionItem[]
  selectedIds: Set<string>
  setItems: (items: AttentionItem[]) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  getSelectedItems: () => AttentionItem[]
}

export const useAttentionStore = create<AttentionState>((set, get) => ({
  items: [],
  selectedIds: new Set(),
  setItems: (items) =>
    set({
      items: items.map((item) => ({
        ...item,
        metadata: item.metadata ?? {},
      })),
    }),
  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedIds: next }
    }),
  clearSelection: () => set({ selectedIds: new Set() }),
  getSelectedItems: () => {
    const { items, selectedIds } = get()
    return items.filter((item) => selectedIds.has(item.id))
  },
}))
