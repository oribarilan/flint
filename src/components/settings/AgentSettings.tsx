import { useEffect, useState, useCallback } from "react";
import {
  getChatStatus,
  initOpencode,
  getProviderAuth,
  startProviderAuth,
  type ChatStatus,
  type FlintConfig,
  type ProviderAuthInfo,
} from "../../lib/commands";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

interface ChatSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatSettings({ config, onUpdate, onResetSection }: ChatSettingsProps) {
  const [chatStatus, setChatStatus] = useState<ChatStatus>({
    connected: false,
    session_id: null,
    repo_path: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderAuthInfo[]>([]);
  const [authingProvider, setAuthingProvider] = useState<string | null>(null);

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

  useEffect(() => {
    refreshStatus();
    refreshProviders();
  }, [refreshStatus, refreshProviders]);

  const handleBrowseRepo = async () => {
    try {
      // Dynamic import — only loads the dialog plugin when needed
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select your second brain repository",
      });
      if (selected && typeof selected === "string") {
        void onUpdate({
          ...config,
          second_brain: { ...config.second_brain, repo_path: selected },
        });
      }
    } catch {
      // Dialog cancelled or unavailable
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await initOpencode();
      refreshStatus();
      refreshProviders();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleProviderAuth = async (providerId: string) => {
    setAuthingProvider(providerId);
    try {
      const url = await startProviderAuth(providerId);
      if (url) {
        const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
        await shellOpen(url);
      }
      // Poll for auth completion
      setTimeout(() => {
        refreshProviders();
        setAuthingProvider(null);
      }, 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setAuthingProvider(null);
    }
  };

  const handleResetDefaults = async () => {
    await onResetSection("chat");
  };

  const hasRepoPath = Boolean(config.second_brain.repo_path);

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* ── Second Brain connection ─────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Second Brain</span>
              <span className={styles.providerDesc}>Local markdown repo powered by OpenCode</span>
            </div>
          </div>
          {chatStatus.connected ? (
            <span className={styles.statusBadge}>Connected</span>
          ) : (
            <span className={styles.statusDisconnected}>Not connected</span>
          )}
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Repo path</span>
          <div className={styles.pathRow}>
            <input
              className={styles.input}
              type="text"
              placeholder="Select your second brain repo…"
              value={config.second_brain.repo_path ?? ""}
              readOnly
            />
            <button className={styles.buttonSmall} onClick={() => void handleBrowseRepo()}>
              Browse
            </button>
          </div>
        </div>

        {hasRepoPath && !chatStatus.connected && (
          <div className={styles.row}>
            <span />
            <button
              className={styles.button}
              onClick={() => void handleConnect()}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting…" : "Connect"}
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

      {/* ── Provider auth status ─────────────────────────── */}
      {chatStatus.connected && providers.length > 0 && (
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
        </section>
      )}

      <ResetSection label="Reset chat settings to defaults?" onReset={handleResetDefaults} />
    </div>
  );
}
