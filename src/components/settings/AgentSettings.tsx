import { useCallback, useEffect, useState } from "react";
import {
  getChatStatus,
  initOpencode,
  getAvailableModels,
  getProjectModelConfigStatus,
  type FlintConfig,
  type ChatStatus,
  type AvailableModel,
  type MonitoredServerConfig,
  type MonitorDiscoveryMode,
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

// Blank form state for a new or editing server entry.
const EMPTY_SERVER_FORM: MonitoredServerConfig = {
  id: "",
  host: "127.0.0.1",
  port: 14097,
  label: null,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ServerFormErrors {
  id?: string;
  host?: string;
  port?: string;
  duplicate?: string;
}

function validateServerForm(
  form: MonitoredServerConfig,
  existing: MonitoredServerConfig[],
  editingId: string | null,
): ServerFormErrors {
  const errors: ServerFormErrors = {};

  if (!form.id.trim()) {
    errors.id = "ID is required.";
  }

  if (!form.host.trim()) {
    errors.host = "Host is required.";
  }

  const portNum = form.port;
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    errors.port = "Port must be 1–65535.";
  }

  // Check duplicates (skip the entry being edited).
  const others = existing.filter((s) => s.id !== editingId);
  if (form.id.trim() && others.some((s) => s.id === form.id.trim())) {
    errors.id = `ID "${form.id}" is already in use.`;
  }
  if (
    !errors.host &&
    !errors.port &&
    others.some((s) => s.host === form.host.trim() && s.port === portNum)
  ) {
    errors.duplicate = `A server at ${form.host}:${String(portNum)} already exists.`;
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  // ── Monitored servers form state ──────────────────────────
  // `editingId` is the ID of the server being edited (null = not editing).
  // `addingNew` = add-form is open.
  const [addingNew, setAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serverForm, setServerForm] = useState<MonitoredServerConfig>(EMPTY_SERVER_FORM);
  const [serverFormErrors, setServerFormErrors] = useState<ServerFormErrors>({});

  const servers: MonitoredServerConfig[] = config.monitored_servers;

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
    await onResetSection("monitor");
  };

  const handleDiscoveryModeChange = (mode: MonitorDiscoveryMode) => {
    if (!["manual", "auto_local", "hybrid"].includes(mode)) {
      return;
    }
    void onUpdate({
      ...config,
      monitor: {
        ...config.monitor,
        discovery_mode: mode,
      },
    });
  };

  const handleMaxRecentSessionsChange = (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return;
    const clamped = Math.min(500, Math.max(1, parsed));
    void onUpdate({
      ...config,
      monitor: {
        ...config.monitor,
        max_recent_sessions: clamped,
      },
    });
  };

  // ── Monitored server handlers ─────────────────────────────

  const openAddForm = () => {
    setServerForm(EMPTY_SERVER_FORM);
    setServerFormErrors({});
    setEditingId(null);
    setAddingNew(true);
  };

  const openEditForm = (server: MonitoredServerConfig) => {
    setServerForm({ ...server });
    setServerFormErrors({});
    setEditingId(server.id);
    setAddingNew(false);
  };

  const cancelServerForm = () => {
    setAddingNew(false);
    setEditingId(null);
    setServerFormErrors({});
  };

  const handleServerFormChange = (field: keyof MonitoredServerConfig, value: string) => {
    setServerForm((prev) => ({
      ...prev,
      [field]: field === "port" ? Number(value) : value,
    }));
    // Clear field error on change.
    if (field in serverFormErrors) {
      setServerFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSaveServer = async () => {
    const trimmedForm: MonitoredServerConfig = {
      ...serverForm,
      id: serverForm.id.trim(),
      host: serverForm.host.trim(),
      label: serverForm.label?.trim() ? serverForm.label.trim() : null,
    };

    const errors = validateServerForm(trimmedForm, servers, editingId);
    if (Object.keys(errors).length > 0) {
      setServerFormErrors(errors);
      return;
    }

    let nextServers: MonitoredServerConfig[];
    if (editingId !== null) {
      // Replace the edited entry.
      nextServers = servers.map((s) => (s.id === editingId ? trimmedForm : s));
    } else {
      // Append new entry.
      nextServers = [...servers, trimmedForm];
    }

    await onUpdate({ ...config, monitored_servers: nextServers });
    cancelServerForm();
  };

  const handleDeleteServer = async (id: string) => {
    const nextServers = servers.filter((s) => s.id !== id);
    await onUpdate({ ...config, monitored_servers: nextServers });
    // If we were editing the deleted server, cancel the form.
    if (editingId === id) {
      cancelServerForm();
    }
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

      {/* ── Monitored Servers ────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Monitored Servers</span>
              <span className={styles.providerDesc}>
                OpenCode servers tracked by the Sessions kit (prefix: <code>s </code>)
              </span>
            </div>
          </div>
          {!addingNew && editingId === null && (
            <button className={styles.buttonSmall} onClick={openAddForm} aria-label="Add server">
              Add
            </button>
          )}
        </div>

        <div className={styles.row}>
          <span className={styles.label}>
            Server discovery
            <span className={styles.sublabel}>
              How Flint finds OpenCode servers on this machine
            </span>
          </span>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              aria-label="Server discovery mode"
              value={config.monitor.discovery_mode}
              onChange={(e) => {
                handleDiscoveryModeChange(e.target.value as MonitorDiscoveryMode);
              }}
            >
              <option value="manual">Manual only</option>
              <option value="auto_local">Auto (local)</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>
            Last sessions limit
            <span className={styles.sublabel}>
              Show at most this many recent sessions in the Sessions kit
            </span>
          </span>
          <input
            className={styles.input}
            style={{ maxWidth: "120px" }}
            aria-label="Max recent sessions"
            type="number"
            min={1}
            max={500}
            value={String(config.monitor.max_recent_sessions)}
            onChange={(e) => {
              handleMaxRecentSessionsChange(e.target.value);
            }}
          />
        </div>

        {/* Existing server list */}
        {servers.length === 0 && !addingNew ? (
          <p className={styles.fieldHint} style={{ paddingTop: "var(--space-sm)" }}>
            No servers configured. Add one to start monitoring OpenCode sessions.
          </p>
        ) : (
          servers.map((server) => (
            <div key={server.id} className={styles.row}>
              {editingId === server.id ? (
                /* Inline edit form */
                <ServerForm
                  form={serverForm}
                  errors={serverFormErrors}
                  onChange={handleServerFormChange}
                  onSave={() => {
                    void handleSaveServer();
                  }}
                  onCancel={cancelServerForm}
                  isEdit
                />
              ) : (
                <>
                  <span className={styles.label}>
                    {server.label ?? `${server.host}:${String(server.port)}`}
                    <span className={styles.sublabel}>
                      {server.id} — {server.host}:{String(server.port)}
                    </span>
                  </span>
                  <div className={styles.providerControl}>
                    <button
                      className={styles.buttonSmallGhost}
                      onClick={() => {
                        openEditForm(server);
                      }}
                      aria-label={`Edit server ${server.id}`}
                    >
                      Edit
                    </button>
                    <button
                      className={styles.buttonSmallGhost}
                      onClick={() => {
                        void handleDeleteServer(server.id);
                      }}
                      aria-label={`Remove server ${server.id}`}
                    >
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}

        {/* Add-new form */}
        {addingNew && (
          <div className={styles.row}>
            <ServerForm
              form={serverForm}
              errors={serverFormErrors}
              onChange={handleServerFormChange}
              onSave={() => {
                void handleSaveServer();
              }}
              onCancel={cancelServerForm}
              isEdit={false}
            />
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
                aria-label="Model"
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

// ---------------------------------------------------------------------------
// ServerForm — inline add/edit form for a single monitored server entry.
// ---------------------------------------------------------------------------

interface ServerFormProps {
  form: MonitoredServerConfig;
  errors: ServerFormErrors;
  onChange: (field: keyof MonitoredServerConfig, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isEdit: boolean;
}

function ServerForm({ form, errors, onChange, onSave, onCancel, isEdit }: ServerFormProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", flex: 1 }}>
      <div className={styles.pathRow}>
        <input
          className={[styles.input, errors.id ? styles.inputError : ""].filter(Boolean).join(" ")}
          value={form.id}
          onChange={(e) => {
            onChange("id", e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="server-id"
          aria-label="Server ID"
          style={{ maxWidth: "140px" }}
        />
        <input
          className={[styles.input, errors.host ? styles.inputError : ""].filter(Boolean).join(" ")}
          value={form.host}
          onChange={(e) => {
            onChange("host", e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="127.0.0.1"
          aria-label="Server host"
          style={{ maxWidth: "160px" }}
        />
        <input
          className={[styles.input, errors.port ? styles.inputError : ""].filter(Boolean).join(" ")}
          value={String(form.port)}
          onChange={(e) => {
            onChange("port", e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="14097"
          aria-label="Server port"
          type="number"
          min={1}
          max={65535}
          style={{ maxWidth: "90px" }}
        />
        <input
          className={styles.input}
          value={form.label ?? ""}
          onChange={(e) => {
            onChange("label", e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Label (optional)"
          aria-label="Server label"
          style={{ maxWidth: "160px" }}
        />
        <button className={styles.buttonSmall} onClick={onSave}>
          {isEdit ? "Save" : "Add"}
        </button>
        <button className={styles.buttonSmallGhost} onClick={onCancel} aria-label="Cancel">
          Cancel
        </button>
      </div>
      {(errors.id ?? errors.host ?? errors.port ?? errors.duplicate) != null && (
        <p className={styles.error} style={{ marginTop: 0 }}>
          {errors.id ?? errors.host ?? errors.port ?? errors.duplicate}
        </p>
      )}
    </div>
  );
}
