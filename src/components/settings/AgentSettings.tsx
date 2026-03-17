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
  const [isAuthing, setIsAuthing] = useState(false);
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

  // On mount: ensure the OpenCode server is running, then fetch data
  useEffect(() => {
    const init = async () => {
      const status = await getChatStatus();

      if (!status.connected && config.second_brain.repo_path) {
        setIsInitializing(true);
        try {
          await initOpencode();
        } catch {
          // Server failed to start
        } finally {
          setIsInitializing(false);
        }
      }

      // Fetch providers and models regardless (they return empty if server isn't up)
      refreshData();
    };
    void init();
  }, [config.second_brain.repo_path, refreshData]);

  // Derive the single active provider
  const activeProvider =
    providers.find((p) => p.connected) ?? (providers.length > 0 ? providers[0] : null);
  const isProviderConnected = activeProvider?.connected ?? false;

  const handleAuth = async () => {
    if (!activeProvider) return;
    setIsAuthing(true);
    setError(null);
    try {
      const url = await startProviderAuth(activeProvider.id);
      if (url) {
        const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
        await shellOpen(url);
      }
      // Poll for completion
      const poll = (remaining: number) => {
        if (remaining <= 0) {
          setIsAuthing(false);
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
      setIsAuthing(false);
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

  const needsBrain = !config.second_brain.repo_path;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* ── Model Provider ──────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Model Provider</span>
              <span className={styles.providerDesc}>
                {activeProvider
                  ? activeProvider.name
                  : isInitializing
                    ? "Starting…"
                    : "Authenticate to use AI models"}
              </span>
            </div>
          </div>
          {isProviderConnected ? (
            <span className={styles.statusBadge}>Connected</span>
          ) : (
            <span className={styles.statusDisconnected}>Not connected</span>
          )}
        </div>

        {needsBrain && (
          <div className={styles.row}>
            <span className={styles.hint}>Select a second brain repo in the Brain tab first</span>
          </div>
        )}

        {!needsBrain && isInitializing && (
          <div className={styles.row}>
            <span className={styles.hint}>Starting agent backend…</span>
          </div>
        )}

        {!needsBrain && !isInitializing && activeProvider && !isProviderConnected && (
          <div className={styles.row}>
            <span />
            <button
              className={styles.button}
              onClick={() => void handleAuth()}
              disabled={isAuthing}
            >
              {isAuthing ? "Connecting…" : `Connect ${activeProvider.name}`}
            </button>
          </div>
        )}

        {!needsBrain && !isInitializing && activeProvider && isProviderConnected && (
          <div className={styles.row}>
            <span />
            <button
              className={styles.buttonGhost}
              onClick={() => void handleAuth()}
              disabled={isAuthing}
            >
              Reconnect
            </button>
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
