import type { AttentionItem } from '../../../main/types'
import { AttentionCard } from './AttentionCard'
import styles from './AttentionPanel.module.css'

interface AttentionPanelProps {
  items: AttentionItem[]
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}

export function AttentionPanel({ items, selectedIds, onSelect, onOpen }: AttentionPanelProps) {
  if (items.length === 0) {
    return (
      <div className={styles.panel} data-testid="attention-panel">
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>⚡</span>
          <span className={styles.emptyText}>No items yet</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel} data-testid="attention-panel">
      <div className={styles.label}>ATTENTION</div>
      <div className={styles.list} role="list">
        {items.map((item) => (
          <AttentionCard
            key={item.id}
            item={item}
            isSelected={selectedIds.has(item.id)}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}
