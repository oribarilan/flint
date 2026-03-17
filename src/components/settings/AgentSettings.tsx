import { useEffect, useState, useCallback, useRef } from "react";
import {
  getChatStatus,
  initOpencode,
  getProviderAuth,
  startProviderAuth,
  completeProviderAuth,
  checkProviderConnected,
  getAvailableModels,
  type FlintConfig,
  type ProviderAuthInfo,
  type AvailableModel,
  type AuthorizeResponse,
} from "../../lib/commands";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

interface AgentSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

/** Phases of the auth flow UI. */
type AuthPhase =
  | { step: "countdown"; seconds: number }
  | { step: "polling" }
  | { step: "code-input"; code: string; submitting: boolean }
  | { step: "timeout" };

interface AuthFlow {
  providerId: string;
  response: AuthorizeResponse;
  phase: AuthPhase;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 40; // ~2 minutes
const BROWSER_DELAY_SECONDS = 5;

export default function AgentSettings({ config, onUpdate, onResetSection }: AgentSettingsProps) {
  const [providers, setProviders] = useState<ProviderAuthInfo[]>([]);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [authFlow, setAuthFlow] = useState<AuthFlow | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshProviders = useCallback(() => {
    getProviderAuth()
      .then((list) => {
        setProviders(list);
        // Auto-select first provider if nothing selected yet.
        setSelectedProvider((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return list[0]?.id ?? "";
        });
      })
      .catch(() => {});
  }, []);

  const refreshModels = useCallback(() => {
    getAvailableModels()
      .then(([list]) => { setModels(list); })
      .catch(() => {});
  }, []);

  // Clean up timers on unmount.
  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (countdownRef.current) clearTimeout(countdownRef.current);
  }, []);

  useEffect(() => {
    refreshProviders();

    const init = async () => {
      const status = await getChatStatus();
      if (!status.connected) {
        setIsInitializing(true);
        try {
          await initOpencode();
        } catch {
          // Server failed to start — provider list still works.
        } finally {
          setIsInitializing(false);
        }
      }
      refreshModels();
    };
    void init();
  }, [refreshProviders, refreshModels]);

  // ── Auth flow ──────────────────────────────────────────

  const startPolling = useCallback((providerId: string, response: AuthorizeResponse) => {
    let remaining = POLL_MAX_ATTEMPTS;

    const tick = () => {
      if (remaining <= 0) {
        setAuthFlow((prev) =>
          prev?.providerId === providerId ? { ...prev, phase: { step: "timeout" } } : prev,
        );
        return;
      }
      remaining -= 1;
      pollRef.current = setTimeout(() => {
        checkProviderConnected(providerId)
          .then((connected) => {
            if (connected) {
              setAuthFlow(null);
              refreshProviders();
              refreshModels();
            } else {
              tick();
            }
          })
          .catch(() => { tick(); });
      }, POLL_INTERVAL_MS);
    };

    setAuthFlow({ providerId, response, phase: { step: "polling" } });
    tick();
  }, [refreshProviders, refreshModels]);

  const handleConnect = async () => {
    if (!selectedProvider) return;
    setError(null);

    try {
      const resp = await startProviderAuth(selectedProvider);

      if (resp.method === "auto") {
        // Device flow — show code, countdown, then open browser + poll.
        setAuthFlow({
          providerId: selectedProvider,
          response: resp,
          phase: { step: "countdown", seconds: BROWSER_DELAY_SECONDS },
        });

        let remaining = BROWSER_DELAY_SECONDS;
        const tick = () => {
          remaining -= 1;
          if (remaining <= 0) {
            // Countdown done — open browser and start polling.
            void import("@tauri-apps/plugin-shell").then(({ open: shellOpen }) => {
              void shellOpen(resp.url);
            });
            startPolling(selectedProvider, resp);
            return;
          }
          setAuthFlow((prev) =>
            prev?.providerId === selectedProvider
              ? { ...prev, phase: { step: "countdown", seconds: remaining } }
              : prev,
          );
          countdownRef.current = setTimeout(tick, 1_000);
        };
        countdownRef.current = setTimeout(tick, 1_000);
      } else {
        // Code flow — open browser immediately, show code input.
        const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
        await shellOpen(resp.url);
        setAuthFlow({
          providerId: selectedProvider,
          response: resp,
          phase: { step: "code-input", code: "", submitting: false },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  const handleSubmitCode = async () => {
    if (authFlow?.phase.step !== "code-input") return;
    const { code } = authFlow.phase;
    if (!code.trim()) return;

    setAuthFlow({ ...authFlow, phase: { step: "code-input", code, submitting: true } });
    setError(null);
    try {
      await completeProviderAuth(authFlow.providerId, code.trim());
      setAuthFlow(null);
      refreshProviders();
      refreshModels();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setAuthFlow({ ...authFlow, phase: { step: "code-input", code, submitting: false } });
    }
  };

  const handleRetry = () => {
    if (!authFlow) return;
    startPolling(authFlow.providerId, authFlow.response);
  };

  const handleCancelAuth = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (countdownRef.current) clearTimeout(countdownRef.current);
    setAuthFlow(null);
    setError(null);
  };

  const handleCopyCode = (text: string) => {
    void navigator.clipboard.writeText(text);
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

  // ── Derived state ──────────────────────────────────────

  const connectedProviders = providers.filter((p) => p.connected);
  const selected = providers.find((p) => p.id === selectedProvider);
  const isSelectedConnected = selected?.connected ?? false;
  const isAuthInProgress = authFlow !== null;
  const currentModelName =
    models.find((m) => m.id === config.chat.default_model)?.name ?? config.chat.default_model;

  // Extract the device code from instructions like "Enter code: XXXX-YYYY".
  const deviceCode = authFlow?.response.instructions.match(/:\s*(.+)/)?.[1]?.trim() ?? null;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Agent</h2>

      {/* ── Provider Connection ───────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <div>
              <span className={styles.providerName}>Model Provider</span>
              <span className={styles.providerDesc}>
                {isInitializing
                  ? "Starting…"
                  : connectedProviders.length > 0
                    ? `${String(connectedProviders.length)} connected`
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

        {!isInitializing && providers.length > 0 && (
          <div className={styles.row}>
            <span className={styles.label}>Provider</span>
            <div className={styles.providerControl}>
              <div className={styles.selectWrap}>
                <select
                  className={styles.select}
                  value={selectedProvider}
                  onChange={(e) => { setSelectedProvider(e.target.value); }}
                  disabled={isAuthInProgress}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.connected ? " ✓" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {isSelectedConnected ? (
                <span className={styles.statusBadge}>Connected</span>
              ) : (
                <button
                  className={styles.buttonSmall}
                  onClick={() => void handleConnect()}
                  disabled={isAuthInProgress}
                >
                  {isAuthInProgress ? "Connecting…" : "Connect"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Auth flow UI ──────────────────────────────── */}
        {authFlow && (
          <div className={styles.authFlow}>
            {/* Device code — prominent display */}
            {deviceCode && (
              <div className={styles.deviceCodeCard}>
                <span className={styles.deviceCodeLabel}>Your code</span>
                <div className={styles.deviceCodeRow}>
                  <span className={styles.deviceCode}>{deviceCode}</span>
                  <button
                    className={styles.copyButton}
                    onClick={() => handleCopyCode(deviceCode)}
                    title="Copy code"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            {/* Phase-specific content */}
            {authFlow.phase.step === "countdown" && (
              <p className={styles.authHint}>
                Opening browser in {String(authFlow.phase.seconds)}s…
              </p>
            )}

            {authFlow.phase.step === "polling" && (
              <p className={styles.authHint}>Waiting for authorization…</p>
            )}

            {authFlow.phase.step === "timeout" && (
              <div className={styles.authTimeoutRow}>
                <p className={styles.authHint}>Authorization not detected.</p>
                <button className={styles.buttonSmall} onClick={handleRetry}>
                  Check again
                </button>
              </div>
            )}

            {authFlow.phase.step === "code-input" && (
              <>
                <p className={styles.authHint}>{authFlow.response.instructions}</p>
                <div className={styles.authCodeRow}>
                  <input
                    className={styles.authCodeInput}
                    type="text"
                    value={authFlow.phase.code}
                    onChange={(e) =>
                      setAuthFlow({
                        ...authFlow,
                        phase: { step: "code-input", code: e.target.value, submitting: false },
                      })
                    }
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSubmitCode(); }}
                    placeholder="Paste authorization code"
                    disabled={authFlow.phase.submitting}
                    autoFocus
                  />
                  <button
                    className={styles.buttonSmall}
                    onClick={() => void handleSubmitCode()}
                    disabled={authFlow.phase.submitting || !authFlow.phase.code.trim()}
                  >
                    {authFlow.phase.submitting ? "Verifying…" : "Submit"}
                  </button>
                </div>
              </>
            )}

            <button className={styles.buttonSmall} onClick={handleCancelAuth}>
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div className={styles.row}>
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
