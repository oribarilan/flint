import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  Notification: vi.fn().mockImplementation((opts: { title: string; body: string }) => ({
    title: opts.title,
    body: opts.body,
    show: vi.fn(),
  })),
}));

vi.mock("@github/copilot-sdk", () => ({
  defineTool: vi.fn((_name: string, config: { handler: unknown }) => ({
    name: _name,
    handler: config.handler,
  })),
}));

import { createHeartbeat } from "../heartbeat/heartbeat";
import { cachePrepData, clearPrepData } from "../heartbeat/prep-cache";
import type { Meeting } from "../types";

const NOW = new Date("2026-05-19T13:45:00Z");

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    title: "Standup",
    startTime: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    endTime: new Date(NOW.getTime() + 45 * 60_000).toISOString(),
    attendees: ["Alice"],
    organizer: "Alice",
    ...overrides,
  };
}

function createMockSession() {
  return {
    sessionId: "flint-monitor",
    sendAndWait: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    abort: vi.fn(),
  };
}

function createMockClient(session = createMockSession()) {
  return {
    createSession: vi.fn().mockResolvedValue(session),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    resumeSession: vi.fn().mockResolvedValue(session),
  };
}

async function flush(): Promise<void> {
  // Enough microtask ticks for: sendAndWait → destroySession → withTimeout → .finally → .catch
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("Heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    clearPrepData();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends a beat on start", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [makeMeeting()],
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);
    heartbeat.stop();
  });

  it("destroys session after each beat to prevent accumulation", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();
    expect(client.deleteSession).toHaveBeenCalledTimes(1);
    heartbeat.stop();
  });

  it("creates a fresh session for each beat", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();
    expect(client.createSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(client.createSession).toHaveBeenCalledTimes(2);
    heartbeat.stop();
  });

  it("prevents overlapping beats", async () => {
    let resolveFirst: (() => void) | null = null;
    const session = createMockSession();
    session.sendAndWait.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveFirst = r;
        }),
    );
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush();

    // Trigger interval tick — should skip because first beat still running
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);

    // Complete first beat
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test: resolveFirst is assigned in the mock above
    resolveFirst!();
    await flush();

    // Next tick should fire
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(2);
    heartbeat.stop();
  });

  it("stops timer after maxConsecutiveFailures", async () => {
    const session = createMockSession();
    session.sendAndWait.mockRejectedValue(new Error("timeout"));
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      maxConsecutiveFailures: 3,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush(); // beat 1 fails

    await vi.advanceTimersByTimeAsync(60_000);
    await flush(); // beat 2 fails

    await vi.advanceTimersByTimeAsync(60_000);
    await flush(); // beat 3 fails — should stop

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("consecutive failures"));

    // No more beats after stop
    session.sendAndWait.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("resets failure count on successful beat", async () => {
    const session = createMockSession();
    session.sendAndWait.mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined);
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      maxConsecutiveFailures: 3,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush(); // beat 1 fails

    await vi.advanceTimersByTimeAsync(60_000);
    await flush(); // beat 2 succeeds — resets counter

    session.sendAndWait.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(3);
    heartbeat.stop();
  });

  it("pauses beats when overlay focused", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      intervalMs: 60_000,
      now: () => Date.now(),
    });
    heartbeat.start();
    await flush(); // initial beat
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);

    heartbeat.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(1); // skipped

    heartbeat.resume();
    await flush();
    expect(session.sendAndWait).toHaveBeenCalledTimes(2); // deferred beat fires
    heartbeat.stop();
  });

  it("prepMeeting does on-demand prep", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      now: () => Date.now(),
    });
    const meeting = makeMeeting();
    await heartbeat.prepMeeting(meeting);
    expect(session.sendAndWait).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- test: accessing mock call args
    const prompt = session.sendAndWait.mock.calls[0][0].prompt as string;
    expect(prompt).toContain(meeting.id);
    heartbeat.stop();
  });

  it("prepMeeting skips if already prepped", async () => {
    const session = createMockSession();
    const client = createMockClient(session);
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
      now: () => Date.now(),
    });
    cachePrepData("m1", ["already done"]);
    await heartbeat.prepMeeting(makeMeeting());
    expect(session.sendAndWait).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it("stop() clears timer and resets state", () => {
    const client = createMockClient();
    const heartbeat = createHeartbeat({
      client: client as never,
      getModel: () => "gpt-4.1",
      getMeetings: () => [],
    });
    heartbeat.start();
    heartbeat.stop();
    // Double stop should be safe
    heartbeat.stop();
  });
});
