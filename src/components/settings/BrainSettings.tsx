import { useEffect, useState, useCallback } from "react";
import { getChatStatus, initOpencode, type ChatStatus, type FlintConfig } from "../../lib/commands";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

interface BrainSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

export default function BrainSettings({ config, onUpdate, onResetSection }: BrainSettingsProps) {
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleBrowseRepo = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select your second brain repository",
      });
      if (selected && typeof selected === "string") {
        await onUpdate({
          ...config,
          second_brain: { ...config.second_brain, repo_path: selected },
        });
        // Auto-connect after selecting a path
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleResetDefaults = async () => {
    await onResetSection("second_brain");
  };

  const hasRepoPath = Boolean(config.second_brain.repo_path);

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Brain</h2>

      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Second Brain</span>
              <span className={styles.providerDesc}>A local git repo of plain markdown files</span>
            </div>
          </div>
          {chatStatus.connected && hasRepoPath ? (
            <span className={styles.statusBadge}>Connected</span>
          ) : hasRepoPath ? (
            <span className={styles.statusDisconnected}>Not connected</span>
          ) : (
            <span className={styles.statusDisconnected}>No repo selected</span>
          )}
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Repository</span>
          <div className={styles.pathRow}>
            <span className={styles.pathValue}>
              {config.second_brain.repo_path ?? "No repo selected"}
            </span>
            <button className={styles.buttonSmall} onClick={() => void handleBrowseRepo()}>
              {hasRepoPath ? "Change" : "Select"}
            </button>
          </div>
        </div>

        {hasRepoPath && !chatStatus.connected && !isConnecting && (
          <div className={styles.row}>
            <span />
            <button className={styles.button} onClick={() => void handleConnect()}>
              Connect
            </button>
          </div>
        )}

        {isConnecting && (
          <div className={styles.row}>
            <span />
            <span className={styles.hint}>Connecting to OpenCode server…</span>
          </div>
        )}

        {error && (
          <div className={styles.row}>
            <span />
            <p className={styles.error}>{error}</p>
          </div>
        )}
      </section>

      <ResetSection label="Reset brain settings to defaults?" onReset={handleResetDefaults} />
    </div>
  );
}
