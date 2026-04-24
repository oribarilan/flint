import { useEffect } from 'react'
import { useAttentionStore } from '../stores/attentionStore'
import type { AttentionItem } from '../../../main/types'

export function useAttention() {
  const { items, selectedIds, setItems, toggleSelect, clearSelection, getSelectedItems } =
    useAttentionStore()

  useEffect(() => {
    window.flint?.getAttentionItems().then((raw) => setItems(raw as AttentionItem[]))

    const unsub = window.flint?.onAttentionUpdate((raw) => setItems(raw as AttentionItem[]))
    return () => {
      unsub?.()
    }
  }, [setItems])

  return { items, selectedIds, toggleSelect, clearSelection, getSelectedItems }
}
