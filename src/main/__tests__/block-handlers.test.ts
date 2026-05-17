import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
  },
}));

const mockOpenExternalUrl = vi.fn((_url: string) => ({ ok: true as const }));
vi.mock("../lib/url", () => ({
  openExternalUrl: (url: string) => mockOpenExternalUrl(url),
}));

import { ipcMain } from "electron";
import { registerBlockHandlers, type BlockHandlerDeps } from "../ipc/block-handlers";
import { IPC_CHANNELS } from "../ipc/channels";
import type { Meeting } from "../types";

const noop = (): void => undefined;

describe("registerBlockHandlers", () => {
  let handler: (event: unknown, raw: unknown) => void;
  let deps: BlockHandlerDeps;
  const mockMeeting: Meeting = {
    id: "m1",
    title: "Standup",
    startTime: "2026-05-18T10:00:00Z",
    endTime: "2026-05-18T10:30:00Z",
    attendees: [],
    organizer: "Alice",
    joinUrl: "https://teams.example.com/join",
  };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.mocked needs the bare reference
    const mockOn = vi.mocked(ipcMain.on);
    mockOn.mockReset();
    mockOpenExternalUrl.mockClear();

    deps = {
      findMeetingById: vi.fn((id: string) => (id === "m1" ? mockMeeting : undefined)),
    };

    registerBlockHandlers(deps);

    const calls = mockOn.mock.calls;
    const actionCall = calls.find(([channel]) => channel === IPC_CHANNELS.BLOCKS_ACTION);
    expect(actionCall).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test setup guarantees this exists
    handler = actionCall![1] as (event: unknown, raw: unknown) => void;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls openExternalUrl for valid join action with known meeting", () => {
    handler({}, { type: "join", payload: { meetingId: "m1" } });

    expect(deps.findMeetingById).toHaveBeenCalledWith("m1");
    expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://teams.example.com/join");
  });

  it("warns when join action has unknown meetingId", () => {
    handler({}, { type: "join", payload: { meetingId: "unknown" } });

    expect(deps.findMeetingById).toHaveBeenCalledWith("unknown");
    expect(console.warn).toHaveBeenCalledWith(
      "[ipc] blocks:action join: meeting not found or no joinUrl",
      expect.any(Object),
    );
  });

  it("warns when join action has no meetingId", () => {
    handler({}, { type: "join", payload: {} });

    expect(console.warn).toHaveBeenCalledWith("[ipc] blocks:action join: missing meetingId");
  });

  it("handles join for meeting without joinUrl", () => {
    const noUrlMeeting = { ...mockMeeting, joinUrl: undefined };
    (deps.findMeetingById as ReturnType<typeof vi.fn>).mockReturnValue(noUrlMeeting);

    handler({}, { type: "join", payload: { meetingId: "m1" } });

    expect(console.warn).toHaveBeenCalledWith(
      "[ipc] blocks:action join: meeting not found or no joinUrl",
      expect.any(Object),
    );
  });

  it("handles dismiss action without error", () => {
    expect(() => {
      handler({}, { type: "dismiss", payload: {} });
    }).not.toThrow();
  });

  it("calls openExternalUrl for open action with url", () => {
    handler({}, { type: "open", payload: { url: "https://example.com" } });

    expect(mockOpenExternalUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("rejects invalid payload schema", () => {
    handler({}, { type: "invalid_type", payload: {} });

    expect(console.warn).toHaveBeenCalledWith(
      "[ipc] blocks:action rejected: invalid payload",
      expect.any(Object),
    );
  });

  it("rejects non-object payload", () => {
    handler({}, "not an object");

    expect(console.warn).toHaveBeenCalledWith(
      "[ipc] blocks:action rejected: invalid payload",
      expect.any(Object),
    );
  });
});
