import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useChatStore } from "../stores/chatStore";
import {
  startCopilotAuth,
  completeCopilotAuth,
  getAuthStatus,
  showWindow,
  type DeviceCodeResponse,
} from "../lib/commands";
import styles from "./AuthPrompt.module.css";

export default function AuthPrompt() {
  const setAuthStatus = useChatStore((s) => s.setAuthStatus);
  const setAuthenticating = useChatStore((s) => s.setAuthenticating);
  const [deviceInfo, setDeviceInfo] = useState<DeviceCodeResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    try {
      const info = await startCopilotAuth();
      setDeviceInfo(info);
      setAuthenticating(true);

      // Open browser for the user to enter the code
      await open(info.verification_uri);

      // Keep Flint visible while user is in the browser
      await showWindow();

      setIsPolling(true);
      await completeCopilotAuth(info.device_code, info.interval);

      const status = await getAuthStatus();
      setAuthStatus(status);
      setAuthenticating(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsPolling(false);
      setAuthenticating(false);
    }
  };

  return (
    <div className={styles.container}>
      {!deviceInfo ? (
        <>
          <p className={styles.heading}>Sign in to GitHub Copilot</p>
          <button className={styles.button} onClick={() => void handleSignIn()}>
            Sign in with GitHub
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </>
      ) : (
        <>
          <p className={styles.heading}>Enter this code on GitHub</p>
          <code className={styles.code}>{deviceInfo.user_code}</code>
          {isPolling && <p className={styles.waiting}>Waiting for authorization…</p>}
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}
    </div>
  );
}
