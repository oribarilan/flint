import { useEffect, useState, useCallback } from "react";
import {
  getChatStatus,
  initOpencode,
  getProviderAuth,
  startProviderAuth,
  getAvailableModels,
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
  const [providers, setProviders] = useState<ProviderAuthInfo[]>([]);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [authingProvider, setAuthingProvider] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(() => {
    getProviderAuth()
      .then(setProviders)
      .catch(() => {});
    getAvailableModels()
      .then(([list]) => setModels(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const init = async () => {
      const status = await getChatStatus();
      if (!status.connected) {
        setIsInitializing(true);
        try {
          await initOpencode();
        } catch {
          // Server failed to start
        } finally {
          setIsInitializing(false);
        }
      }
      refreshData();
    };
    void init();
  }, [refreshData]);

  const handleAuth = async (providerId: string) => {
    setAuthingProvider(providerId);
    setError(null);
    try {
      const url = await startProviderAuth(providerId);
      if (url) {
        const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
        await shellOpen(url);
      }
      const poll = (remaining: number) => {
        if (remaining <= 0) {
          setAuthingProvider(null);
          return;
        }
        setTimeout(() => {
          refreshData();
          poll(remaining - 1);
        }, 3000);
      };
      poll(5);
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

  const connectedProviders = providers.filter((p) => p.connected);
  const disconnectedProviders = providers.filter((p) => !p.connected);
  const currentModelName =
    models.find((m) => m.id === config.chat.default_model)?.name ?? config.chat.default_model;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* ── Connected Providers ──────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Model Providers</span>
              <span className={styles.providerDesc}>
                {isInitializing
                  ? "Starting…"
                  : connectedProviders.length > 0
                    ? `${connectedProviders.length} connected`
                    : "Connect a provider to use AI models"}
              </span>
            </div>
          </div>
        </div>

        {isInitializing && (
          <div className={styles.row}>
            <span className={styles.hint}>Starting agent backend…</span>
          </div>
        )}

        {!isInitializing &&
          connectedProviders.map((p) => (
            <div key={p.id} className={styles.row}>
              <span className={styles.label}>{p.name}</span>
              <span className={styles.statusBadge}>Connected</span>
            </div>
          ))}

        {!isInitializing &&
          disconnectedProviders.map((p) => (
            <div key={p.id} className={styles.row}>
              <span className={styles.label}>{p.name}</span>
              <button
                className={styles.buttonSmall}
                onClick={() => void handleAuth(p.id)}
                disabled={authingProvider === p.id}
              >
                {authingProvider === p.id ? "Connecting…" : "Connect"}
              </button>
            </div>
          ))}

        {!isInitializing && providers.length === 0 && (
          <div className={styles.row}>
            <span className={styles.hint}>No providers available</span>
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
          <div className={styles.providerHeader}>
            <div className={styles.providerInfo}>
              <div>
                <span className={styles.providerName}>Default Model</span>
                <span className={styles.providerDesc}>{currentModelName}</span>
              </div>
            </div>
          </div>
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
