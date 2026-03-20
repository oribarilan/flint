import { useCallback, useEffect, useState } from "react";
import {
  getChatStatus,
  initOpencode,
  getAvailableModels,
  getProjectModelConfigStatus,
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

interface ProjectModelStatus {
  has_model: boolean;
  model: string | null;
}

export default function AgentSettings({ config, onUpdate, onResetSection }: AgentSettingsProps) {
  const [chatStatus, setChatStatus] = useState<ChatStatus>({
    connected: false,
    session_id: null,
    repo_path: null,
  });
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [projectModelStatus, setProjectModelStatus] = useState<ProjectModelStatus | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [repoPathDraft, setRepoPathDraft] = useState(config.second_brain.repo_path ?? "");
  const [repoPathError, setRepoPathError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    getChatStatus()
      .then(setChatStatus)
      .catch(() => {
        // Status check failed — will retry on next action.
      });
  }, []);

  const refreshModels = useCallback(() => {
    Promise.allSettled([getAvailableModels(), getProjectModelConfigStatus()])
      .then(([modelsResult, projectResult]) => {
        if (modelsResult.status === "fulfilled") {
          setModels(modelsResult.value[0]);
        } else {
          setModels([]);
        }

        if (projectResult.status === "fulfilled") {
          setProjectModelStatus({
            has_model: projectResult.value.has_model,
            model: projectResult.value.model,
          });
        } else {
          setProjectModelStatus(null);
        }
      })
      .catch(() => {
        setModels([]);
        setProjectModelStatus(null);
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

  useEffect(() => {
    setRepoPathDraft(config.second_brain.repo_path ?? "");
  }, [config.second_brain.repo_path]);

  const reconnectAndRefresh = async (): Promise<void> => {
    await initOpencode();
    refreshStatus();
    refreshModels();
  };

  const handleSaveRepoPath = async (rawPath?: string): Promise<void> => {
    const nextPath = (rawPath ?? repoPathDraft).trim();
    if (!nextPath) {
      setRepoPathError("Repository path is required.");
      return;
    }

    setRepoPathError(null);
    setError(null);

    await onUpdate({
      ...config,
      second_brain: { ...config.second_brain, repo_path: nextPath },
    });

    setIsConnecting(true);
    try {
      await reconnectAndRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleBrowseRepo = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select your second brain repository",
      });

      if (selected && typeof selected === "string") {
        setRepoPathDraft(selected);
        await handleSaveRepoPath(selected);
      }
    } catch {
      // Dialog cancelled or unavailable.
    }
  };

  const handleRepoPathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSaveRepoPath();
    }
  };

  const handleRestart = async () => {
    if (isRestarting || isConnecting) return;

    setIsRestarting(true);
    setError(null);
    try {
      await reconnectAndRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsRestarting(false);
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

  const hasRepoPath = Boolean((config.second_brain.repo_path ?? "").trim());
  const currentModelName =
    models.find((m) => m.id === config.chat.default_model)?.name ?? config.chat.default_model;
  const modelSubtitle =
    models.length === 0
      ? chatStatus.connected
        ? "No models available from OpenCode"
        : "Models unavailable while disconnected"
      : projectModelStatus?.has_model && projectModelStatus.model
        ? `Project default: ${projectModelStatus.model}`
        : currentModelName;

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
          ) : isConnecting || isRestarting ? (
            <span className={styles.hint}>{isRestarting ? "Restarting…" : "Connecting…"}</span>
          ) : hasRepoPath ? (
            <span className={styles.statusDisconnected}>Not connected</span>
          ) : (
            <span className={styles.statusDisconnected}>No repo selected</span>
          )}
        </div>

        <div className={styles.rowTop}>
          <span className={styles.label}>Repository</span>
          <div className={styles.pathRow}>
            <input
              className={[styles.input, repoPathError ? styles.inputError : ""]
                .filter(Boolean)
                .join(" ")}
              value={repoPathDraft}
              onChange={(e) => {
                setRepoPathDraft(e.target.value);
                if (repoPathError) {
                  setRepoPathError(null);
                }
              }}
              onKeyDown={handleRepoPathKeyDown}
              placeholder="/path/to/second-brain"
              aria-label="Second brain repository path"
            />
            <button className={styles.buttonSmall} onClick={() => void handleBrowseRepo()}>
              Browse
            </button>
            <button
              className={styles.buttonSmall}
              onClick={() => {
                void handleSaveRepoPath();
              }}
              disabled={isConnecting || isRestarting}
            >
              Save
            </button>
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>Connection</span>
          <div className={styles.providerControl}>
            <span className={styles.statusInline}>
              {chatStatus.connected ? "Connected" : "Disconnected"}
            </span>
            <button
              className={styles.buttonSmallGhost}
              onClick={() => {
                void handleRestart();
              }}
              disabled={isConnecting || isRestarting}
            >
              {isRestarting ? "Restarting…" : "Restart OpenCode"}
            </button>
          </div>
        </div>

        {repoPathError && (
          <div className={styles.row}>
            <span />
            <p className={styles.error}>{repoPathError}</p>
          </div>
        )}

        {error && (
          <div className={styles.row}>
            <span />
            <p className={styles.error}>{error}</p>
          </div>
        )}
      </section>

      {/* ── Default Model ────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Default Model</span>
              <span className={styles.providerDesc}>{modelSubtitle}</span>
            </div>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Model</span>
          {models.length > 0 ? (
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
          ) : (
            <p className={styles.fieldHint}>
              No models available right now. Reconnect and try again.
            </p>
          )}
        </div>
      </section>

      <ResetSection label="Reset agent settings to defaults?" onReset={handleResetDefaults} />
    </div>
  );
}
