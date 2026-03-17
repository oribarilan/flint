import { useEffect, useState, useCallback } from "react";
import { getChatStatus, initOpencode, type ChatStatus, type FlintConfig } from "../../lib/commands";
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

  const refreshStatus = useCallback(() => {
    getChatStatus()
      .then(setChatStatus)
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleRepoPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = e.target.value || null;
    void onUpdate({
      ...config,
      second_brain: { ...config.second_brain, repo_path: newPath },
    });
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await initOpencode();
      refreshStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleResetDefaults = async () => {
    await onResetSection("chat");
  };

  const hasRepoPath = Boolean(config.second_brain.repo_path);

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Chat</h2>

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
          <input
            className={styles.input}
            type="text"
            placeholder="/path/to/your/second-brain"
            value={config.second_brain.repo_path ?? ""}
            onChange={handleRepoPathChange}
          />
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

        {chatStatus.connected && (
          <div className={styles.row}>
            <span className={styles.label}>Session</span>
            <span className={styles.value}>{chatStatus.session_id?.slice(0, 8) ?? "—"}</span>
          </div>
        )}

        {error && (
          <div className={styles.row}>
            <span />
            <p className={styles.error}>{error}</p>
          </div>
        )}

        <div className={styles.row}>
          <span />
          <span className={styles.hint}>
            Configure model and auth in <code>opencode.jsonc</code> inside your repo
          </span>
        </div>
      </section>

      <ResetSection label="Reset chat settings to defaults?" onReset={handleResetDefaults} />
    </div>
  );
}
