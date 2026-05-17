import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { ChildProcess, spawn as spawnType } from "child_process";
import { EventEmitter } from "events";

type SpawnFn = typeof spawnType;
type FetchFn = typeof globalThis.fetch;
import {
  createAgencyCalendarSource,
  toUtcIso,
  parseSseResponse,
  parseCalendarText,
} from "../../calendar/agency-calendar";
import fixtureEvents from "../fixtures/agency-calendar-response.json";

// ── Helpers ──

/** Build an SSE response body wrapping calendar events. */
function makeSseBody(events: unknown[]): string {
  const text = `Calendar view retrieved successfully.\n${JSON.stringify(events)}`;
  const rpc = {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text }] },
  };
  return `data: ${JSON.stringify(rpc)}\n\n`;
}

/** Build an SSE response with events wrapped in `{ value: [...] }` (real Graph API shape). */
function makeSseBodyWrapped(events: unknown[]): string {
  const text = `Calendar view retrieved successfully.\n${JSON.stringify({ value: events })}`;
  const rpc = {
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text }] },
  };
  return `data: ${JSON.stringify(rpc)}\n\n`;
}

/** Create a mock ChildProcess that emits a port on stdout. */
function createMockProcess(port: number | null = 3456): {
  proc: ChildProcess;
  emitStdout: (data: string) => void;
  emitStderr: (data: string) => void;
  emitError: (err: Error) => void;
  emitExit: (code: number | null) => void;
} {
  const proc = new EventEmitter() as unknown as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  (proc as unknown as Record<string, unknown>).stdout = stdoutEmitter;
  (proc as unknown as Record<string, unknown>).stderr = stderrEmitter;
  (proc as unknown as Record<string, unknown>).exitCode = null;
  (proc as unknown as Record<string, unknown>).killed = false;
  (proc as unknown as Record<string, unknown>).kill = vi.fn(() => {
    (proc as unknown as Record<string, unknown>).killed = true;
  });
  (proc as unknown as Record<string, unknown>).pid = 12345;

  const emitStdout = (data: string): void => {
    stdoutEmitter.emit("data", Buffer.from(data));
  };
  const emitStderr = (data: string): void => {
    stderrEmitter.emit("data", Buffer.from(data));
  };
  const emitError = (err: Error): void => {
    proc.emit("error", err);
  };
  const emitExit = (code: number | null): void => {
    (proc as unknown as Record<string, unknown>).exitCode = code;
    proc.emit("exit", code);
  };

  // Auto-emit port if provided
  if (port !== null) {
    setTimeout(() => {
      emitStdout(`${String(port)}\n`);
    }, 5);
  }

  return { proc, emitStdout, emitStderr, emitError, emitExit };
}

function createMockFetch(responseBody: string, status = 200): Mock {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(responseBody),
  });
}

describe("agency-calendar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── toUtcIso ──

  describe("toUtcIso", () => {
    it("converts UTC time correctly", () => {
      expect(toUtcIso("2026-05-16T09:00:00.0000000", "UTC")).toBe("2026-05-16T09:00:00.000Z");
    });

    it("converts America/Los_Angeles (PDT) correctly", () => {
      // PDT is UTC-7, so 10:00 Pacific = 17:00 UTC
      expect(toUtcIso("2026-05-16T10:00:00.0000000", "America/Los_Angeles")).toBe(
        "2026-05-16T17:00:00.000Z",
      );
    });

    it("converts Etc/UTC correctly", () => {
      expect(toUtcIso("2026-05-16T14:00:00.0000000", "Etc/UTC")).toBe("2026-05-16T14:00:00.000Z");
    });

    it("converts positive-offset timezone (Asia/Kolkata)", () => {
      // IST is UTC+5:30, so 15:30 IST = 10:00 UTC
      expect(toUtcIso("2026-05-16T15:30:00.0000000", "Asia/Kolkata")).toBe(
        "2026-05-16T10:00:00.000Z",
      );
    });

    it("converts Windows timezone ID (Israel Standard Time)", () => {
      // Israel Standard Time → Asia/Jerusalem (IDT is UTC+3 in summer)
      expect(toUtcIso("2026-05-16T12:00:00.0000000", "Israel Standard Time")).toBe(
        "2026-05-16T09:00:00.000Z",
      );
    });

    it("converts Windows timezone ID (Eastern Standard Time)", () => {
      // Eastern Standard Time → America/New_York (EDT is UTC-4 in summer)
      expect(toUtcIso("2026-05-16T10:00:00.0000000", "Eastern Standard Time")).toBe(
        "2026-05-16T14:00:00.000Z",
      );
    });

    it("converts Windows timezone ID (Pacific Standard Time)", () => {
      // Pacific Standard Time → America/Los_Angeles (PDT is UTC-7 in summer)
      expect(toUtcIso("2026-05-16T10:00:00.0000000", "Pacific Standard Time")).toBe(
        "2026-05-16T17:00:00.000Z",
      );
    });
  });

  // ── SSE parsing ──

  describe("parseSseResponse", () => {
    it("extracts JSON from SSE data line", () => {
      const body = 'data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n';
      const result = parseSseResponse(body);
      expect(result).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    });

    it("throws when no data line present", () => {
      expect(() => parseSseResponse("event: message\n\n")).toThrow("No SSE data line");
    });
  });

  describe("parseCalendarText", () => {
    it("strips the preamble and parses JSON", () => {
      const text = 'Calendar view retrieved successfully.\n[{"id":"123"}]';
      const result = parseCalendarText(text);
      expect(result).toEqual([{ id: "123" }]);
    });

    it("parses plain JSON without preamble", () => {
      const text = '[{"id":"456"}]';
      const result = parseCalendarText(text);
      expect(result).toEqual([{ id: "456" }]);
    });
  });

  // ── Full integration with fixture data ──

  describe("createAgencyCalendarSource", () => {
    it("parses fixture data and returns correct meetings", async () => {
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBody(fixtureEvents));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      const meetings = await source.fetchTodayMeetings();

      // Should have 4 meetings: standup, pacific design review, all-hands, no-subject
      // Cancelled (sprint review) and declined (lunch chat) are filtered out
      expect(meetings).toHaveLength(4);

      // Check standup (UTC)
      const standup = meetings.find((m) => m.title === "Team Standup");
      expect(standup).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by assertion above
      expect(standup!.startTime).toBe("2026-05-16T09:00:00.000Z");
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(standup!.attendees).toEqual(["Alice Johnson", "Bob Smith"]);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(standup!.organizer).toBe("Alice Johnson");
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(standup!.joinUrl).toBe("https://teams.microsoft.com/l/meetup-join/standup123");
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(standup!.isAllDay).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(standup!.agenda).toBe("Daily standup — share blockers and progress.");

      // Check pacific design review (non-UTC timezone)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by toHaveLength(4) above
      const design = meetings.find((m) => m.title === "Pacific Design Review")!;
      expect(design.startTime).toBe("2026-05-16T17:00:00.000Z"); // 10:00 PDT = 17:00 UTC
      expect(design.endTime).toBe("2026-05-16T18:00:00.000Z");
      expect(design.joinUrl).toBe("https://teams.microsoft.com/l/meetup-join/design456");

      // Check all-day event
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by toHaveLength(4) above
      const allHands = meetings.find((m) => m.title === "Company All-Hands")!;
      expect(allHands.isAllDay).toBe(true);
      expect(allHands.agenda).toBeUndefined(); // empty bodyPreview

      // Check no-subject fallback
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by toHaveLength(4) above
      const noSubject = meetings.find((m) => m.title === "(No subject)")!;
      expect(noSubject).toBeDefined();
      expect(noSubject.attendees).toEqual(["noname@contoso.com"]); // email fallback

      source.stop();
    });

    it("handles Graph API response wrapped in { value: [...] }", async () => {
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBodyWrapped(fixtureEvents));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      const meetings = await source.fetchTodayMeetings();

      // Same filtering as raw array: 4 meetings (cancelled + declined filtered out)
      expect(meetings).toHaveLength(4);
      expect(meetings.find((m) => m.title === "Team Standup")).toBeDefined();
      source.stop();
    });

    it("returns empty array for empty calendar", async () => {
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBody([]));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      const meetings = await source.fetchTodayMeetings();
      expect(meetings).toEqual([]);
      source.stop();
    });

    it("skips malformed events and returns valid ones", async () => {
      const events = [
        fixtureEvents[0], // valid standup
        { id: 123, subject: "Bad" }, // invalid: id is number, missing start/end
        fixtureEvents[1], // valid pacific design review
      ];

      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBody(events));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      const meetings = await source.fetchTodayMeetings();

      expect(meetings).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        "[agency-calendar]",
        "Skipping malformed event:",
        expect.any(String),
      );

      source.stop();
    });

    it("filters cancelled events", async () => {
      const cancelled = { ...fixtureEvents[0], isCancelled: true };
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBody([cancelled]));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      expect(await source.fetchTodayMeetings()).toEqual([]);
      source.stop();
    });

    it("filters declined events", async () => {
      const declined = {
        ...fixtureEvents[0],
        responseStatus: { response: "declined" },
      };
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBody([declined]));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      expect(await source.fetchTodayMeetings()).toEqual([]);
      source.stop();
    });

    it("returns empty on HTTP timeout", async () => {
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      const meetings = await source.fetchTodayMeetings();

      expect(meetings).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith("[agency-calendar]", "Fetch timed out after 10s");

      source.stop();
    });

    it("returns empty on HTTP error status", async () => {
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch("Internal Server Error", 500);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      expect(await source.fetchTodayMeetings()).toEqual([]);
      source.stop();
    });

    it("handles ENOENT when agency binary not found", async () => {
      const { proc, emitError } = createMockProcess(null);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
      });

      // Emit ENOENT right after start
      setTimeout(() => {
        emitError(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
      }, 2);

      await source.start();
      expect(await source.fetchTodayMeetings()).toEqual([]);
      source.stop();
    });

    it("handles binary not resolved", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => undefined,
      });

      await source.start();
      expect(await source.fetchTodayMeetings()).toEqual([]);
    });

    it("handles port discovery timeout", async () => {
      vi.useFakeTimers();

      const { proc } = createMockProcess(null); // don't emit port
      const spawnProcess = vi.fn().mockReturnValue(proc);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
      });

      const startPromise = source.start();
      await vi.advanceTimersByTimeAsync(5_001);
      await startPromise;

      expect(await source.fetchTodayMeetings()).toEqual([]);

      source.stop();
      vi.useRealTimers();
    });

    it("attempts lazy respawn when subprocess dies between polls", async () => {
      const mockProc1 = createMockProcess(4000);
      let spawnCount = 0;
      const spawnProcess = vi.fn().mockImplementation(() => {
        spawnCount++;
        if (spawnCount === 1) return mockProc1.proc;
        // Create second process lazily so port emission happens after listeners attach
        const mockProc2 = createMockProcess(4001);
        return mockProc2.proc;
      });

      const fetchFn = createMockFetch(makeSseBody([fixtureEvents[0]]));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();

      // First fetch works
      let meetings = await source.fetchTodayMeetings();
      expect(meetings).toHaveLength(1);

      // Simulate process death
      mockProc1.emitExit(1);

      // Next fetch should trigger respawn
      meetings = await source.fetchTodayMeetings();
      expect(meetings).toHaveLength(1);
      expect(spawnCount).toBe(2);

      source.stop();
    });

    it("handles JSON-RPC error response", async () => {
      const rpcError = {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600, message: "Invalid Request" },
      };
      const body = `data: ${JSON.stringify(rpcError)}\n\n`;

      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(body);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      expect(await source.fetchTodayMeetings()).toEqual([]);
      source.stop();
    });

    it("maps all-day events correctly", async () => {
      const allDayEvent = fixtureEvents[2]; // Company All-Hands
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);
      const fetchFn = createMockFetch(makeSseBody([allDayEvent]));

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
        fetchFn: fetchFn as unknown as FetchFn,
      });

      await source.start();
      const meetings = await source.fetchTodayMeetings();

      expect(meetings).toHaveLength(1);
      expect(meetings[0].isAllDay).toBe(true);
      expect(meetings[0].title).toBe("Company All-Hands");

      source.stop();
    });

    it("stop is idempotent", async () => {
      const { proc } = createMockProcess(4000);
      const spawnProcess = vi.fn().mockReturnValue(proc);

      const source = createAgencyCalendarSource({
        resolveAgency: () => "/usr/bin/agency",
        spawnProcess: spawnProcess as unknown as SpawnFn,
      });

      await source.start();
      source.stop();
      source.stop(); // second call should not throw
    });
  });
});
