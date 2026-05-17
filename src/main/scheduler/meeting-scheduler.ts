import { Notification } from "electron";
import type { Meeting } from "../types";

const POLL_INTERVAL_MS = 15 * 60_000; // 15 minutes
const TICK_INTERVAL_MS = 60_000; // 60 seconds

export interface MeetingScheduler {
  start(): void;
  stop(): void;
  pollNow(): Promise<void>;
}

export interface MeetingSchedulerConfig {
  /**
   * Fetch upcoming meetings (next ~24h). Implementation may shell out to `workiq ask`,
   * call an MCP server, or return a stub.
   *
   * V1 stub returns []; the production implementation will be added once the
   * `workiq` CLI integration shape is settled.
   */
  fetchUpcomingMeetings: () => Promise<Meeting[]>;
  /** Minutes before a meeting starts to fire the alert. */
  getAlertMinutes: () => number;
  /** Optional notification factory (test seam). Defaults to Electron's `Notification`. */
  notificationFactory?: (options: { title: string; body: string }) => { show: () => void };
  /** Called after a successful poll with the fetched meetings. */
  onMeetingsUpdated?: (meetings: Meeting[]) => void;
  /** Clock seam — `Date.now` by default. */
  now?: () => number;
}

export function createMeetingScheduler(config: MeetingSchedulerConfig): MeetingScheduler {
  const now = config.now ?? ((): number => Date.now());
  const factory =
    config.notificationFactory ?? ((opts): { show: () => void } => new Notification(opts));

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let cache: Meeting[] = [];
  const alerted = new Set<string>();
  let running = false;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const meetings = await config.fetchUpcomingMeetings();
      cache = meetings;
      // Drop alerted entries for meetings that no longer appear (started or cancelled).
      const liveIds = new Set(meetings.map((m) => m.id));
      for (const id of [...alerted]) {
        if (!liveIds.has(id)) alerted.delete(id);
      }
      try {
        config.onMeetingsUpdated?.(meetings);
      } catch (err) {
        console.error(
          "[meeting-scheduler] onMeetingsUpdated callback failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    } catch (err) {
      console.error(
        "[meeting-scheduler] poll failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  function tick(): void {
    if (!running) return;
    const alertMs = config.getAlertMinutes() * 60_000;
    const t = now();
    for (const meeting of cache) {
      if (alerted.has(meeting.id)) continue;
      const start = new Date(meeting.startTime).getTime();
      if (Number.isNaN(start)) continue;
      const delta = start - t;
      if (delta <= 0) continue; // already started
      if (delta > alertMs) continue; // not yet within alert window
      const minutes = Math.max(1, Math.round(delta / 60_000));
      const body = `Meeting starting in ${String(minutes)} min: ${meeting.title}`;
      try {
        factory({ title: "Flint", body }).show();
      } catch (err) {
        console.error(
          "[meeting-scheduler] notification failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
      alerted.add(meeting.id);
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      console.log("[meeting-scheduler] starting");
      void poll();
      pollTimer = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
      tickTimer = setInterval(tick, TICK_INTERVAL_MS);
    },

    stop(): void {
      if (!running) return;
      running = false;
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (tickTimer !== null) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
      alerted.clear();
      cache = [];
      console.log("[meeting-scheduler] stopped");
    },

    async pollNow(): Promise<void> {
      await poll();
    },
  };
}
