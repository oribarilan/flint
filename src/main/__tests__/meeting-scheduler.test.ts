import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  Notification: vi.fn().mockImplementation((opts: { title: string; body: string }) => ({
    title: opts.title,
    body: opts.body,
    show: vi.fn(),
  })),
}));

import { createMeetingScheduler } from "../scheduler/meeting-scheduler";
import type { Meeting } from "../types";

const NOW = new Date("2026-04-30T10:00:00Z");

function meetingAt(minutesFromNow: number, id = "m1", title = "Standup"): Meeting {
  return {
    id,
    title,
    startTime: new Date(NOW.getTime() + minutesFromNow * 60_000).toISOString(),
    endTime: new Date(NOW.getTime() + (minutesFromNow + 30) * 60_000).toISOString(),
    attendees: [],
    organizer: "you",
  };
}

interface MockNotification {
  title: string;
  body: string;
  show: ReturnType<typeof vi.fn>;
}

function setup(opts: {
  meetings: Meeting[];
  alertMinutes?: number;
  onMeetingsUpdated?: (meetings: Meeting[]) => void;
}) {
  const fetchUpcomingMeetings = vi.fn().mockResolvedValue(opts.meetings);
  const created: MockNotification[] = [];
  const factory = vi.fn((n: { title: string; body: string }): MockNotification => {
    const obj = { title: n.title, body: n.body, show: vi.fn() };
    created.push(obj);
    return obj;
  });
  const scheduler = createMeetingScheduler({
    fetchUpcomingMeetings,
    getAlertMinutes: () => opts.alertMinutes ?? 5,
    notificationFactory: factory,
    onMeetingsUpdated: opts.onMeetingsUpdated,
    now: () => Date.now(),
  });
  return { scheduler, fetchUpcomingMeetings, created };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("MeetingScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls fetchUpcomingMeetings on start (immediate poll)", async () => {
    const { scheduler, fetchUpcomingMeetings } = setup({ meetings: [] });
    scheduler.start();
    await flush();
    expect(fetchUpcomingMeetings).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("does not alert for a meeting outside the alert window", async () => {
    const { scheduler, created } = setup({
      meetings: [meetingAt(10)], // 10 min from now
      alertMinutes: 5,
    });
    scheduler.start();
    await flush();

    // Advance one tick (60s)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(0);
    scheduler.stop();
  });

  it("alerts once when a meeting enters the alert window", async () => {
    const { scheduler, created } = setup({
      meetings: [meetingAt(5)], // exactly 5 min from now
      alertMinutes: 5,
    });
    scheduler.start();
    await flush();

    // Advance 60s — meeting now 4 min away, within window
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(1);
    expect(created[0].body).toContain("Standup");
    expect(created[0].show).toHaveBeenCalledTimes(1);

    // Another tick — same meeting, must not duplicate
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(1);

    scheduler.stop();
  });

  it("does not alert for meetings already started", async () => {
    const { scheduler, created } = setup({
      meetings: [meetingAt(-1)], // started 1 min ago
      alertMinutes: 5,
    });
    scheduler.start();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(0);
    scheduler.stop();
  });

  it("stop() prevents further ticks", async () => {
    const { scheduler, created } = setup({
      meetings: [meetingAt(3)],
      alertMinutes: 5,
    });
    scheduler.start();
    await flush();
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(created).toHaveLength(0);
  });

  it("alerts each meeting independently", async () => {
    const { scheduler, created } = setup({
      meetings: [meetingAt(2, "a", "A"), meetingAt(3, "b", "B")],
      alertMinutes: 5,
    });
    scheduler.start();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(created).toHaveLength(2);
    const titles = created.map((c) => c.body).sort();
    expect(titles[0]).toContain("A");
    expect(titles[1]).toContain("B");
    scheduler.stop();
  });

  it("re-polls every 15 minutes", async () => {
    const { scheduler, fetchUpcomingMeetings } = setup({ meetings: [] });
    scheduler.start();
    await flush();
    expect(fetchUpcomingMeetings).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(fetchUpcomingMeetings).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("handles fetch failures without crashing", async () => {
    const fetchUpcomingMeetings = vi.fn().mockRejectedValue(new Error("net"));
    const scheduler = createMeetingScheduler({
      fetchUpcomingMeetings,
      getAlertMinutes: () => 5,
      notificationFactory: () => ({ show: vi.fn() }),
    });
    scheduler.start();
    await flush();
    // No throw, error is logged
    expect(console.error).toHaveBeenCalled();
    scheduler.stop();
  });

  it("calls onMeetingsUpdated after successful poll", async () => {
    const meetings = [meetingAt(5)];
    const onMeetingsUpdated = vi.fn();
    const { scheduler } = setup({ meetings, onMeetingsUpdated });
    scheduler.start();
    await flush();
    expect(onMeetingsUpdated).toHaveBeenCalledTimes(1);
    expect(onMeetingsUpdated).toHaveBeenCalledWith(meetings);
    scheduler.stop();
  });

  it("does not call onMeetingsUpdated on fetch failure", async () => {
    const onMeetingsUpdated = vi.fn();
    const fetchUpcomingMeetings = vi.fn().mockRejectedValue(new Error("net"));
    const scheduler = createMeetingScheduler({
      fetchUpcomingMeetings,
      getAlertMinutes: () => 5,
      notificationFactory: () => ({ show: vi.fn() }),
      onMeetingsUpdated,
    });
    scheduler.start();
    await flush();
    expect(onMeetingsUpdated).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("does not crash when onMeetingsUpdated callback throws", async () => {
    const onMeetingsUpdated = vi.fn().mockImplementation(() => {
      throw new Error("callback boom");
    });
    const { scheduler } = setup({ meetings: [meetingAt(5)], onMeetingsUpdated });
    scheduler.start();
    await flush();
    expect(onMeetingsUpdated).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
    // Scheduler should still be running — verify next poll works
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(onMeetingsUpdated).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
