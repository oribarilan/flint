import { openSettings } from "../lib/commands";
import { suppressNextBlurHide } from "../lib/focus";
import styles from "./AuthPrompt.module.css";

export default function AuthPrompt() {
  return (
    <div className={styles.container}>
      <p className={styles.heading}>Chat is powered by GitHub Copilot</p>
      <button
        className={styles.button}
        onClick={() => {
          suppressNextBlurHide();
          void openSettings().catch((err: unknown) => {
            console.error("Failed to open settings:", err);
          });
        }}
      >
        Sign in via Settings
      </button>
    </div>
  );
}
