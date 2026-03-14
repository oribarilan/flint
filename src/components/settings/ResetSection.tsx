import { useState } from "react";
import styles from "./settings.module.css";

interface ResetSectionProps {
  label: string;
  onReset: () => Promise<void>;
}

/** Shared reset-to-defaults control with confirm/cancel. */
export default function ResetSection({ label, onReset }: ResetSectionProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    await onReset();
    setConfirming(false);
  };

  return (
    <div className={styles.resetRow}>
      {confirming ? (
        <>
          <span className={styles.resetConfirmText}>{label}</span>
          <button className={styles.buttonGhost} onClick={() => void handleConfirm()}>
            Confirm
          </button>
          <button
            className={styles.buttonGhost}
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className={styles.buttonGhost}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Restore Defaults
        </button>
      )}
    </div>
  );
}
