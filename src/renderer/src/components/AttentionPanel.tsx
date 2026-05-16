import { Zap } from "lucide-react";
import type { AttentionItem } from "../../../main/types";
import { AttentionCard } from "./AttentionCard";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import styles from "./AttentionPanel.module.css";

interface AttentionPanelProps {
  items: AttentionItem[];
  selectedIds: Set<string>;
  keyboardFocusedIndex?: number | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

const EMPTY_COPY = {
  connected: "No items yet",
  reconnecting: "Reconnecting to Copilot…",
  disconnected: "Not connected to Copilot",
} as const;

export function AttentionPanel({
  items,
  selectedIds,
  keyboardFocusedIndex,
  onSelect,
  onOpen,
}: AttentionPanelProps) {
  const status = useConnectionStatus();

  if (items.length === 0) {
    return (
      <div className={styles.panel} data-testid="attention-panel">
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Zap size={24} />
          </span>
          <span className={styles.emptyText}>{EMPTY_COPY[status]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="attention-panel">
      <div className={styles.label}>ATTENTION</div>
      <div className={styles.list}>
        {items.map((item, index) => (
          <AttentionCard
            key={item.id}
            item={item}
            isSelected={selectedIds.has(item.id)}
            isKeyboardFocused={keyboardFocusedIndex === index}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}
