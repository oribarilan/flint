import type { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import { createPermissionPolicy } from "../copilot/permissions";
import { loadPrompt } from "../copilot/system-prompt";
import { createHeartbeatTools } from "./tools";
import { buildBeatPrompt, buildPrepPrompt } from "./prompt-builder";
import { hasPrepData, cleanupExpiredPrep } from "./prep-cache";
import type { Meeting } from "../types";

const DEFAULT_INTERVAL_MS = 10 * 60_000; // 10 minutes
const DEFAULT_TIMEOUT_MS = 90_000; // 90 seconds
const DEFAULT_MAX_FAILURES = 5;
const SESSION_CREATE_TIMEOUT_MS = 30_000; // 30 seconds
const SESSION_DELETE_TIMEOUT_MS = 10_000; // 10 seconds

const HEARTBEAT_AVAILABLE_TOOLS = ["cache_meeting_prep", "show_notification"] as const;

/** Race a promise against a timeout. Rejects with a descriptive error on expiry. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(ms)}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export interface Heartbeat {
  start(): void;
  stop(): void;
  /** Force an immediate beat. */
  beat(): Promise<void>;
  /** On-demand prep for a specific meeting. Skips if already prepped. */
  prepMeeting(meeting: Meeting): Promise<void>;
  /** Pause beats (e.g. overlay is focused). */
  pause(): void;
  /** Resume beats after pause. Fires a deferred beat if one was skipped. */
  resume(): void;
}

export interface HeartbeatConfig {
  client: CopilotClient;
  getModel: () => string;
  getMeetings: () => Meeting[];
  /** Beat interval in ms. Default: 10 minutes. */
  intervalMs?: number;
  /** Timeout per beat in ms. Default: 90 seconds. */
  timeoutMs?: number;
  /** Consecutive failures before stopping timer. Default: 5. */
  maxConsecutiveFailures?: number;
  /** Clock seam for testing. Default: Date.now. */
  now?: () => number;
}

export function createHeartbeat(config: HeartbeatConfig): Heartbeat {
  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxFailures = config.maxConsecutiveFailures ?? DEFAULT_MAX_FAILURES;
  const now = config.now ?? ((): number => Date.now());

  let session: CopilotSession | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let paused = false;
  let beating = false;
  let consecutiveFailures = 0;
  let deferredBeat = false;

  async function ensureSession(): Promise<CopilotSession> {
    if (session) return session;

    const model = config.getModel();
    console.log("[heartbeat] Creating monitor session with model:", model);

    session = await withTimeout(
      config.client.createSession({
        sessionId: `flint-monitor-${String(Date.now())}`,
        model,
        onPermissionRequest: createPermissionPolicy(),
        streaming: false,
        systemMessage: { content: loadPrompt("heartbeat") },
        tools: createHeartbeatTools(),
        availableTools: [...HEARTBEAT_AVAILABLE_TOOLS],
        mcpServers: {
          "work-iq": {
            type: "local",
            command: "npx",
            args: ["-y", "@microsoft/workiq", "mcp"],
            tools: ["*"],
          },
        },
      }),
      SESSION_CREATE_TIMEOUT_MS,
      "session creation",
    );

    console.log("[heartbeat] Monitor session created:", session.sessionId);
    return session;
  }

  /** Null session immediately so the next beat can proceed, then clean up in the background. */
  function destroySession(): void {
    if (!session) return;
    const id = session.sessionId;
    session = null;
    // Fire-and-forget with its own timeout — never blocks the next beat
    void withTimeout(
      config.client.deleteSession(id),
      SESSION_DELETE_TIMEOUT_MS,
      "session delete",
    ).catch((err: unknown) => {
      console.error(
        "[heartbeat] session cleanup failed:",
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  async function doBeat(): Promise<void> {
    if (beating) return;
    beating = true;
    try {
      const meetings = config.getMeetings();
      const preppedIds = new Set<string>();
      for (const m of meetings) {
        if (hasPrepData(m.id)) preppedIds.add(m.id);
      }

      cleanupExpiredPrep(new Set(meetings.map((m) => m.id)));

      const prompt = buildBeatPrompt(meetings, preppedIds, new Date(now()));
      const s = await ensureSession();
      await s.sendAndWait({ prompt }, timeoutMs);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error("[heartbeat] beat failed:", err instanceof Error ? err.message : String(err));
      if (consecutiveFailures >= maxFailures) {
        console.warn(
          `[heartbeat] ${String(consecutiveFailures)} consecutive failures, stopping timer`,
        );
        stopTimer();
      }
    } finally {
      destroySession();
      beating = false;
    }
  }

  async function doPrep(meeting: Meeting): Promise<void> {
    if (hasPrepData(meeting.id)) return;
    const prompt = buildPrepPrompt(meeting, new Date(now()));
    try {
      const s = await ensureSession();
      await s.sendAndWait({ prompt }, timeoutMs);
    } catch (err) {
      console.error(
        "[heartbeat] on-demand prep failed:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      destroySession();
    }
  }

  function startTimer(): void {
    if (timer) return;
    timer = setInterval(() => {
      if (paused) {
        deferredBeat = true;
        return;
      }
      void doBeat();
    }, intervalMs);
  }

  function stopTimer(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      console.log("[heartbeat] starting");
      void doBeat();
      startTimer();
    },

    stop(): void {
      if (!running) return;
      running = false;
      stopTimer();
      session = null;
      paused = false;
      deferredBeat = false;
      consecutiveFailures = 0;
      console.log("[heartbeat] stopped");
    },

    async beat(): Promise<void> {
      await doBeat();
    },

    async prepMeeting(meeting: Meeting): Promise<void> {
      await doPrep(meeting);
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
      if (deferredBeat) {
        deferredBeat = false;
        void doBeat();
      }
    },
  };
}
