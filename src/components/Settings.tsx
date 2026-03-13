import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  startCopilotAuth,
  completeCopilotAuth,
  getAuthStatus,
  signOut,
  type AuthStatus,
  type DeviceCodeResponse,
} from "../lib/commands";
import styles from "./Settings.module.css";

export default function Settings() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authenticated: false,
    username: null,
  });
  const [deviceInfo, setDeviceInfo] = useState<DeviceCodeResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuthStatus()
      .then(setAuthStatus)
      .catch(() => {
        // Auth check is best-effort
      });
  }, []);

  const handleSignIn = async () => {
    setError(null);
    try {
      const info = await startCopilotAuth();
      setDeviceInfo(info);

      await open(info.verification_uri);

      setIsPolling(true);
      await completeCopilotAuth(info.device_code, info.interval);

      const status = await getAuthStatus();
      setAuthStatus(status);
      setDeviceInfo(null);
      setIsPolling(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsPolling(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setAuthStatus({ authenticated: false, username: null });
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Flint Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>GitHub Copilot</h2>

        {authStatus.authenticated ? (
          <div className={styles.authInfo}>
            <span className={styles.statusBadge}>Connected</span>
            <button className={styles.signOutButton} onClick={() => void handleSignOut()}>
              Sign Out
            </button>
          </div>
        ) : deviceInfo ? (
          <div className={styles.deviceFlow}>
            <p className={styles.label}>Enter this code on GitHub:</p>
            <code className={styles.code}>{deviceInfo.user_code}</code>
            {isPolling && <p className={styles.waiting}>Waiting for authorization…</p>}
            {error && <p className={styles.error}>{error}</p>}
          </div>
        ) : (
          <div className={styles.authInfo}>
            <span className={styles.statusDisconnected}>Not connected</span>
            <button className={styles.signInButton} onClick={() => void handleSignIn()}>
              Sign in with GitHub
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
