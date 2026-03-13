import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  startCopilotAuth,
  completeCopilotAuth,
  getAuthStatus,
  signOut,
  type AuthStatus,
  type DeviceCodeResponse,
  type FlintConfig,
} from "../../lib/commands";
import styles from "./settings.module.css";

const COPILOT_MODELS = [
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

interface ChatSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
}

export default function ChatSettings({ config, onUpdate }: ChatSettingsProps) {
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

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void onUpdate({
      ...config,
      chat: { ...config.chat, default_model: e.target.value },
    });
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Chat</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Provider</h3>

        {authStatus.authenticated ? (
          <div className={styles.row}>
            <span className={styles.statusBadge}>Connected</span>
            <button className={styles.buttonGhost} onClick={() => void handleSignOut()}>
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
          <div className={styles.row}>
            <span className={styles.statusDisconnected}>Not connected</span>
            <button className={styles.button} onClick={() => void handleSignIn()}>
              Sign in with GitHub
            </button>
          </div>
        )}
        {!deviceInfo && error && <p className={styles.error}>{error}</p>}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Model</h3>
        <div className={styles.row}>
          <span className={styles.label}>Default model</span>
          <select
            className={styles.select}
            value={config.chat.default_model}
            onChange={handleModelChange}
          >
            {COPILOT_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </div>
  );
}
