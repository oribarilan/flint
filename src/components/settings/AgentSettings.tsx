import { useEffect, useState, useCallback } from "react";
import {
  getChatStatus,
  initOpencode,
  getAvailableModels,
  type FlintConfig,
  type ChatStatus,
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
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    getChatStatus()
      .then(setChatStatus)
      .catch(() => {
        // Status check failed — will retry on next action.
      });
  }, []);

  const refreshModels = useCallback(() => {
    getAvailableModels()
      .then(([list]) => {
        setModels(list);
      })
      .catch(() => {
        // Models unavailable — section will be hidden.
      });
  }, []);

  useEffect(() => {
    refreshStatus();

    const init = async () => {
      const status = await getChatStatus();
      if (!status.connected) {
        setIsConnecting(true);
        try {
          await initOpencode();
        } catch {
          // Server failed to start — still show settings.
        } finally {
          setIsConnecting(false);
          refreshStatus();
        }
      }
      refreshModels();
    };
    void init();
  }, [refreshStatus, refreshModels]);

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
        // Reconnect with new repo path.
        setIsConnecting(true);
        setError(null);
        try {
          await initOpencode();
          refreshStatus();
          refreshModels();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        } finally {
          setIsConnecting(false);
        }
      }
    } catch {
      // Dialog cancelled or unavailable.
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
    await onResetSection("second_brain");
  };

  const hasRepoPath = Boolean(config.second_brain.repo_path);
  const currentModelName =
    models.find((m) => m.id === config.chat.default_model)?.name ?? config.chat.default_model;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* ── Second Brain ─────────────────────────────────── */}
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
          ) : isConnecting ? (
            <span className={styles.hint}>Connecting…</span>
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

        {error && (
          <div className={styles.row}>
            <span />
            <p className={styles.error}>{error}</p>
          </div>
        )}
      </section>

      {/* ── Default Model ────────────────────────────────── */}
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
