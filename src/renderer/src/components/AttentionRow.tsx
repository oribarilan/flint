import { AttentionIcon } from "./AttentionIcon";
import type { AttentionItem } from "../../../main/types";
import styles from "./AttentionRow.module.css";

interface AttentionRowProps {
  item: AttentionItem;
  onOpen: (id: string) => void;
}

export function AttentionRow({ item, onOpen }: AttentionRowProps) {
  return (
    <div
      className={styles.row}
      onClick={() => {
        onOpen(item.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item.id);
        }
      }}
    >
      <div className={styles.icon}>
        <AttentionIcon name={item.icon} size={11} aria-hidden="true" />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{item.title}</div>
        {item.description && <div className={styles.desc}>{item.description}</div>}
      </div>
    </div>
  );
}
