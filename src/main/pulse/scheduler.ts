import { powerMonitor } from "electron";
import type { SessionManager } from "../copilot/sessions";
import type { CopilotManager } from "../copilot/client";
import type { AttentionStore } from "../attention/store";
import type { FlintConfig, PollFrequency } from "../types";

export interface PulseScheduler {
  start(): void;
  stop(): void;
  pollNow(): void;
}

export interface PulseSchedulerConfig {
  sessionManager: SessionManager;
  copilotManager: CopilotManager;
  attentionStore: AttentionStore;
  getConfig: () => FlintConfig;
  onOverlayFocus: (callback: () => void) => void;
  onOverlayBlur: (callback: () => void) => void;
}

export const BASE_INTERVALS: Record<PollFrequency, number> = {
  relaxed: 20 * 60_000,
  normal: 10 * 60_000,
  aggressive: 5 * 60_000,
};

export const OFF_HOURS_MULTIPLIER = 3;
const CONSECUTIVE_FAILURE_WARN_THRESHOLD = 3;

export function isWorkHours(date: Date): boolean {
  const day = date.getDay();
  const hour = date.getHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

export function getIntervalMs(frequency: PollFrequency, now: Date): number {
  const base = BASE_INTERVALS[frequency];
  return isWorkHours(now) ? base : base * OFF_HOURS_MULTIPLIER;
}

export function createPulseScheduler(config: PulseSchedulerConfig): PulseScheduler {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastPollTime: string | undefined;
  let frozen = false;
  let deferredPoll = false;
  let consecutiveFailures = 0;
  let running = false;
  let removeStatusListener: (() => void) | null = null;

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleNext(): void {
    if (!running) return;
    const { pollFrequency } = config.getConfig();
    const interval = getIntervalMs(pollFrequency, new Date());
    timerId = setTimeout(() => {
      void poll();
    }, interval);
  }

  async function poll(): Promise<void> {
    timerId = null;

    if (!running) return;

    const cfg = config.getConfig();
    if (!cfg.pollEnabled) {
      console.log("[pulse] Polling disabled, skipping");
      scheduleNext();
      return;
    }

    if (frozen) {
      console.log("[pulse] Overlay focused, deferring poll");
      deferredPoll = true;
      return;
    }

    const status = config.copilotManager.getStatus();
    if (status !== "connected") {
      console.log("[pulse] Copilot not connected, skipping poll");
      scheduleNext();
      return;
    }

    try {
      const currentItems = config.attentionStore.getAll();
      const context = lastPollTime ? { lastPollTime, currentItems } : { currentItems };

      await config.sessionManager.sendMonitorPoll(context);

      lastPollTime = new Date().toISOString();
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error("[pulse] Poll failed:", err instanceof Error ? err.message : err);
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_WARN_THRESHOLD) {
        console.warn(
          `[pulse] ${String(CONSECUTIVE_FAILURE_WARN_THRESHOLD)} consecutive poll failures, will retry next interval`,
        );
      }
    }

    scheduleNext();
  }

  function handlePowerResume(): void {
    if (running) {
      console.log("[pulse] System resumed, triggering immediate poll");
      pollNow();
    }
  }

  function handleOverlayFocus(): void {
    frozen = true;
    console.log("[pulse] Overlay focused, pausing polls");
  }

  function handleOverlayBlur(): void {
    frozen = false;
    console.log("[pulse] Overlay blurred, resuming polls");
    if (deferredPoll) {
      deferredPoll = false;
      pollNow();
    }
  }

  function pollNow(): void {
    if (!running) return;
    clearTimer();
    void poll();
  }

  return {
    start(): void {
      if (running) return;

      const cfg = config.getConfig();
      if (!cfg.pollEnabled) {
        console.log("[pulse] Polling disabled in config, not starting");
        return;
      }

      running = true;
      console.log("[pulse] Starting scheduler");

      // Register power monitor listener
      powerMonitor.on("resume", handlePowerResume);

      // Register overlay focus/blur listeners
      config.onOverlayFocus(handleOverlayFocus);
      config.onOverlayBlur(handleOverlayBlur);

      // Register connection status listener
      removeStatusListener = config.copilotManager.onStatusChange((status) => {
        if (status === "connected") {
          console.log("[pulse] Copilot reconnected, triggering immediate poll");
          pollNow();
        }
      });

      // Fire bootstrap poll immediately
      void poll();
    },

    stop(): void {
      if (!running) return;

      running = false;
      clearTimer();
      deferredPoll = false;

      // Remove power monitor listener
      powerMonitor.removeListener("resume", handlePowerResume);

      // Remove status listener
      if (removeStatusListener) {
        removeStatusListener();
        removeStatusListener = null;
      }

      console.log("[pulse] Scheduler stopped");
    },

    pollNow(): void {
      pollNow();
    },
  };
}
