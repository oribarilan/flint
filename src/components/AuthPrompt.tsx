import { openSettings } from "../lib/commands";
import { suppressNextBlurHide } from "../lib/focus";
import styles from "./AuthPrompt.module.css";

export default function AuthPrompt() {
  return (
    <div className={styles.container}>
      <p className={styles.heading}>Configure your second brain repo in Settings</p>
      <button
        className={styles.button}
        onClick={() => {
          suppressNextBlurHide();
          void openSettings().catch((err: unknown) => {
            console.error("Failed to open settings:", err);
          });
        }}
      >
        Open Settings
      </button>
    </div>
  );
}
