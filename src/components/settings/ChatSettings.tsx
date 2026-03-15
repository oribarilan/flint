import { useEffect, useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import {
  startCopilotAuth,
  completeCopilotAuth,
  getAuthStatus,
  signOut,
  type AuthStatus,
  type DeviceCodeResponse,
  type FlintConfig,
} from "../../lib/commands";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

const COPILOT_MODELS = [
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-5-mini", label: "GPT-5 Mini" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

/** Countdown duration before opening the browser (seconds). */
const COUNTDOWN_SECONDS = 7;

interface ChatSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

// ---------------------------------------------------------------------------
// Device flow hook — encapsulates the countdown + clipboard + polling logic
// ---------------------------------------------------------------------------

type DeviceFlowPhase = "idle" | "code-shown" | "polling" | "done";

function useDeviceFlow(onAuthComplete: () => void) {
  const [phase, setPhase] = useState<DeviceFlowPhase>("idle");
  const [deviceInfo, setDeviceInfo] = useState<DeviceCodeResponse | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    cleanup();
    cancelledRef.current = false;
    setError(null);
    setCopied(false);

    try {
      const info = await startCopilotAuth();
      // Ref may be mutated by cleanup() between awaits
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelledRef.current) return;

      setDeviceInfo(info);
      setPhase("code-shown");

      // Countdown before opening browser
      setCountdown(COUNTDOWN_SECONDS);
      let remaining = COUNTDOWN_SECONDS;

      timerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);

        if (remaining <= 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }, 1000);

      // Wait for countdown to finish, then poll
      await new Promise((resolve) => setTimeout(resolve, COUNTDOWN_SECONDS * 1000));
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelledRef.current) return;

      setPhase("polling");
      void open(info.verification_uri);

      await completeCopilotAuth(info.device_code, info.interval);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelledRef.current) return;

      setPhase("done");
      onAuthComplete();
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (cancelledRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase("idle");
    }
  }, [cleanup, onAuthComplete]);

  const reset = useCallback(() => {
    cleanup();
    setPhase("idle");
    setDeviceInfo(null);
    setCountdown(0);
    setCopied(false);
    setError(null);
  }, [cleanup]);

  const copyCode = useCallback(async () => {
    if (!deviceInfo) return;
    try {
      await navigator.clipboard.writeText(deviceInfo.user_code);
      setCopied(true);
    } catch {
      // Clipboard access denied — user can copy manually
    }
  }, [deviceInfo]);

  return { phase, deviceInfo, countdown, copied, error, start, reset, copyCode };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatSettings({ config, onUpdate, onResetSection }: ChatSettingsProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    authenticated: false,
    username: null,
  });

  const refreshAuth = useCallback(() => {
    getAuthStatus()
      .then(setAuthStatus)
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const deviceFlow = useDeviceFlow(refreshAuth);

  const handleSignOut = async () => {
    await signOut();
    setAuthStatus({ authenticated: false, username: null });
    deviceFlow.reset();
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

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Chat</h2>

      {/* ── GitHub Copilot provider card ─────────────────────── */}
      <section className={styles.section}>
        <div className={styles.providerHeader}>
          <div className={styles.providerInfo}>
            <svg
              className={styles.providerIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.162 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            <div>
              <span className={styles.providerName}>GitHub Copilot</span>
              <span className={styles.providerDesc}>
                Models from OpenAI, Anthropic, and Google via your GitHub subscription
              </span>
            </div>
          </div>
          {authStatus.authenticated ? (
            <span className={styles.statusBadge}>Connected</span>
          ) : (
            <span className={styles.statusDisconnected}>Not connected</span>
          )}
        </div>

        {/* Connection controls */}
        {authStatus.authenticated ? (
          <>
            <div className={styles.row}>
              <span className={styles.label}>Default model</span>
              <div className={styles.selectWrap}>
                <select
                  className={styles.select}
                  value={config.chat.default_model}
                  onChange={handleModelChange}
                >
                  {COPILOT_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.row}>
              <span />
              <button className={styles.buttonGhost} onClick={() => void handleSignOut()}>
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <DeviceFlowUI flow={deviceFlow} />
        )}
      </section>

      <ResetSection
        label="Reset chat settings to defaults?"
        onReset={handleResetDefaults}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device flow sub-component
// ---------------------------------------------------------------------------

function DeviceFlowUI({ flow }: { flow: ReturnType<typeof useDeviceFlow> }) {
  const { phase, deviceInfo, countdown, copied, error, start, copyCode } = flow;

  if (phase === "idle") {
    return (
      <div className={styles.providerConnect}>
        <button className={styles.button} onClick={() => void start()}>
          Connect
        </button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  if ((phase === "code-shown" || phase === "polling") && deviceInfo) {
    return (
      <div className={styles.deviceFlow}>
        <p className={styles.deviceFlowStep}>Enter this code on GitHub:</p>
        <div className={styles.codeRow}>
          <code className={styles.code}>{deviceInfo.user_code}</code>
          <button
            className={copied ? styles.copyButtonDone : styles.copyButton}
            onClick={() => void copyCode()}
            aria-label="Copy code"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        {phase === "code-shown" && (
          <p className={styles.countdown}>Opening GitHub in {countdown}…</p>
        )}
        {phase === "polling" && <p className={styles.waiting}>Waiting for authorization…</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  return null;
}
