import { useConnectionStatus } from "../hooks/useConnectionStatus";
import styles from "./ConnectionDot.module.css";

const STATUS_COPY = {
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected — check Copilot CLI",
} as const;

/**
 * Small (8px) colored dot that surfaces the Copilot connection status
 * in the bottom bar. Peripheral signal — not interactive.
 */
export function ConnectionDot() {
  const status = useConnectionStatus();
  const label = STATUS_COPY[status];

  return (
    <span
      className={`${styles.dot} ${styles[status]}`}
      role="status"
      aria-live="polite"
      title={label}
      data-testid="connection-dot"
      data-status={status}
    >
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
