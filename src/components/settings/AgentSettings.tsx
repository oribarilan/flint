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

  const refreshAll = useCallback(() => {
    getChatStatus()
      .then(setChatStatus)
      .catch(() => {});
    getProviderAuth()
      .then(setProviders)
      .catch(() => {});
    getAvailableModels()
      .then(([list]) => setModels(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleProviderAuth = async (providerId: string) => {
    setAuthingProvider(providerId);
    setError(null);
    try {
      const url = await startProviderAuth(providerId);
      if (url) {
        const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
        await shellOpen(url);
      }
      // Poll for completion a few times
      const poll = (remaining: number) => {
        if (remaining <= 0) {
          setAuthingProvider(null);
          return;
        }
        setTimeout(() => {
          refreshAll();
          setAuthingProvider((current) => {
            if (current === providerId) {
              poll(remaining - 1);
            }
            return current;
          });
        }, 3000);
      };
      poll(3);
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

  const connectedCount = providers.filter((p) => p.connected).length;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* ── Model Providers ─────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Model Providers</span>
              <span className={styles.providerDesc}>LLM providers powering the agent</span>
            </div>
          </div>
          {connectedCount > 0 ? (
            <span className={styles.statusBadge}>{connectedCount} connected</span>
          ) : (
            <span className={styles.statusDisconnected}>None connected</span>
          )}
        </div>

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

        {providers.length === 0 && (
          <div className={styles.row}>
            <span className={styles.hint}>
              Connect your second brain repo first to see available providers
            </span>
          </div>
        )}

        {error && (
          <div className={styles.row}>
            <span />
            <p className={styles.error}>{error}</p>
          </div>
        )}
      </section>

      {/* ── Default model ───────────────────────────────── */}
      {models.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Default Model</h3>
          <div className={styles.row}>
            <span className={styles.label}>Model</span>
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
        </section>
      )}

      <ResetSection label="Reset agent settings to defaults?" onReset={handleResetDefaults} />
    </div>
  );
}
