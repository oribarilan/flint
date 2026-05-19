import { useEffect, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ActionConfirmData } from "../../../../main/lib/blocks";
import styles from "./ActionConfirmation.module.css";

interface ActionConfirmationProps {
  data: ActionConfirmData;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

export function ActionConfirmation({ data, onDismiss }: ActionConfirmationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div className={styles.container} data-testid="action-confirmation">
      <div className={styles.iconWrap}>
        {data.status === "done" ? (
          <Check size={16} aria-hidden="true" data-testid="check-icon" />
        ) : (
          <Loader2
            size={16}
            aria-hidden="true"
            className={styles.spinner}
            data-testid="spinner-icon"
          />
        )}
      </div>
      <span className={styles.label}>{data.label}</span>
    </div>
  );
}
