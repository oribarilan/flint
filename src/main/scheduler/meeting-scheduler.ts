import { Notification } from "electron";
import type { Meeting } from "../types";

const POLL_INTERVAL_MS = 15 * 60_000; // 15 minutes
const TICK_INTERVAL_MS = 60_000; // 60 seconds
/** Prep runs this many minutes before the spotlight appears. */
const PREP_LEAD_MINUTES = 5;

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
  /** Minutes before a meeting to show the spotlight overlay. Null/undefined disables. */
  getSpotlightMinutes?: () => number | null;
  /** Called when a meeting enters the spotlight window. */
  onSpotlight?: (meeting: Meeting) => void;
  /** Called PREP_LEAD_MINUTES before the spotlight to pre-fetch AI context. */
  onPrepare?: (meeting: Meeting) => void;
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
  const spotlighted = new Set<string>();
  const prepared = new Set<string>();
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
      for (const id of [...spotlighted]) {
        if (!liveIds.has(id)) spotlighted.delete(id);
      }
      for (const id of [...prepared]) {
        if (!liveIds.has(id)) prepared.delete(id);
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
      const start = new Date(meeting.startTime).getTime();
      if (Number.isNaN(start)) continue;
      const delta = start - t;
      if (delta <= 0 || meeting.isAllDay) continue;

      // Notification check
      if (!alerted.has(meeting.id) && delta <= alertMs) {
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

      // Prep check — fires PREP_LEAD_MINUTES before the spotlight
      const spotlightMins = config.getSpotlightMinutes?.();
      if (spotlightMins != null && spotlightMins > 0) {
        const prepMs = (spotlightMins + PREP_LEAD_MINUTES) * 60_000;
        if (!prepared.has(meeting.id) && delta <= prepMs) {
          try {
            config.onPrepare?.(meeting);
          } catch (err) {
            console.error(
              "[meeting-scheduler] prep callback failed:",
              err instanceof Error ? err.message : String(err),
            );
          }
          prepared.add(meeting.id);
        }
      }

      // Spotlight check — separate threshold, separate tracking
      if (
        spotlightMins != null &&
        spotlightMins > 0 &&
        !spotlighted.has(meeting.id) &&
        delta <= spotlightMins * 60_000
      ) {
        try {
          config.onSpotlight?.(meeting);
        } catch (err) {
          console.error(
            "[meeting-scheduler] spotlight callback failed:",
            err instanceof Error ? err.message : String(err),
          );
        }
        spotlighted.add(meeting.id);
      }
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
      spotlighted.clear();
      prepared.clear();
      cache = [];
      console.log("[meeting-scheduler] stopped");
    },

    async pollNow(): Promise<void> {
      await poll();
    },
  };
}
