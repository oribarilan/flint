import { ExternalLink } from "lucide-react";
import type { AttentionItem } from "../../../main/types";
import { AttentionIcon } from "./AttentionIcon";
import styles from "./AttentionCard.module.css";

interface AttentionCardProps {
  item: AttentionItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function formatRelativeTime(timestamp?: string): string | null {
  if (!timestamp) return null;
  const diff = new Date(timestamp).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const minutes = Math.round(absDiff / 60_000);
  const hours = Math.round(absDiff / 3_600_000);
  const days = Math.round(absDiff / 86_400_000);

  if (diff > 0) {
    if (minutes <= 1) return "now";
    if (minutes < 60) return `in ${minutes}m`;
    if (hours < 24) return `in ${hours}h`;
    if (days === 1) return "tomorrow";
    return `in ${days}d`;
  } else {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }
}

function isFutureTimestamp(timestamp?: string): boolean {
  if (!timestamp) return false;
  return new Date(timestamp).getTime() > Date.now();
}

export function AttentionCard({ item, isSelected, onSelect, onOpen }: AttentionCardProps) {
  const relativeTime = formatRelativeTime(item.timestamp);
  const isFuture = isFutureTimestamp(item.timestamp);
  const cardClassName = `${styles.card} ${isSelected ? styles.selected : ""}`;

  const handleCardClick = () => {
    onSelect(item.id);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(item.id);
    }
  };

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen(item.id);
  };

  return (
    <div
      className={cardClassName}
      data-testid={`attention-card-${item.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className={styles.icon}>
        <AttentionIcon name={item.icon} size={16} />
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{item.title}</div>
        {item.description && <div className={styles.description}>{item.description}</div>}

        {item.openAction && (
          <div className={styles.actions}>
            <button className={styles.openButton} onClick={handleOpenClick} type="button">
              Open <ExternalLink size={12} />
            </button>
          </div>
        )}
      </div>

      {relativeTime && (
        <span
          className={`${styles.timeBadge} ${isFuture ? styles.timeBadgeFuture : styles.timeBadgePast}`}
        >
          {relativeTime}
        </span>
      )}
    </div>
  );
}
