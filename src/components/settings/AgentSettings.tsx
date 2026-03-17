import { useEffect, useState, useCallback } from "react";
import {
  getChatStatus,
  getProviderAuth,
  startProviderAuth,
  getAvailableModels,
  type ChatStatus,
  type FlintConfig,
  type ProviderAuthInfo,
  type AvailableModel,
} from "../../lib/commands";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

interface AgentSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

export default function AgentSettings({ config, onUpdate, onResetSection }: AgentSettingsProps) {
  const [chatStatus, setChatStatus] = useState<ChatStatus>({
    connected: false,
    session_id: null,
    repo_path: null,
  });
  const [providers, setProviders] = useState<ProviderAuthInfo[]>([]);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [authingProvider, setAuthingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    getChatStatus()
      .then(setChatStatus)
      .catch(() => {});
  }, []);

  const refreshProviders = useCallback(() => {
    getProviderAuth()
      .then(setProviders)
      .catch(() => {});
  }, []);

  const refreshModels = useCallback(() => {
    getAvailableModels()
      .then(([list]) => setModels(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshProviders();
    refreshModels();
  }, [refreshStatus, refreshProviders, refreshModels]);

  const handleProviderAuth = async (providerId: string) => {
    setAuthingProvider(providerId);
    setError(null);
    try {
      const url = await startProviderAuth(providerId);
      if (url) {
        const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
        await shellOpen(url);
      }
      setTimeout(() => {
        refreshProviders();
        refreshModels();
        setAuthingProvider(null);
      }, 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setAuthingProvider(null);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void onUpdate({
      ...config,
      chat: { ...config.chat, default_model: e.target.value },
    });
  };

  const handleResetDefaults = async () => {
    await onResetSection("chat");
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* OpenCode status */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>OpenCode</span>
              <span className={styles.providerDesc}>AI backend powering the agent</span>
            </div>
          </div>
          {chatStatus.connected ? (
            <span className={styles.statusBadge}>Connected</span>
          ) : (
            <span className={styles.statusDisconnected}>Not connected</span>
          )}
        </div>

        {models.length > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Default model</span>
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={config.chat.default_model}
                onChange={handleModelChange}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.provider_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Provider auth */}
      {providers.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Providers</h3>
          {providers.map((p) => (
            <div key={p.id} className={styles.row}>
              <span className={styles.label}>{p.name}</span>
              <div className={styles.providerStatus}>
                {p.connected ? (
                  <span className={styles.statusBadge}>Connected</span>
                ) : (
                  <button
                    className={styles.buttonSmall}
                    onClick={() => void handleProviderAuth(p.id)}
                    disabled={authingProvider === p.id}
                  >
                    {authingProvider === p.id ? "Authorizing…" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className={styles.row}>
              <span />
              <p className={styles.error}>{error}</p>
            </div>
          )}
        </section>
      )}

      <ResetSection label="Reset agent settings to defaults?" onReset={handleResetDefaults} />
    </div>
  );
}
