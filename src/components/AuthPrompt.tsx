import { openSettings } from "../lib/commands";
import { suppressNextBlurHide } from "../lib/focus";
import styles from "./AuthPrompt.module.css";

export default function AuthPrompt() {
  return (
    <div className={styles.container}>
      <p className={styles.heading}>Sign in to use AI chat</p>
      <button
        className={styles.button}
        onClick={() => {
          suppressNextBlurHide();
          void openSettings();
        }}
      >
        Open Settings
      </button>
    </div>
  );
}
