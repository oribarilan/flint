import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSetTitle } = vi.hoisted(() => ({
  mockSetTitle: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { quit: vi.fn() },
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    setTitle: mockSetTitle,
  })),
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromPath: vi.fn(), createEmpty: vi.fn() },
}));

vi.mock("../window/overlay", () => ({
  showOverlay: vi.fn(),
}));

import {
  buildTrayMenuTemplate,
  countUpcomingMeetings,
  createTray,
  updateTrayBadge,
} from "../window/tray";
import type { Meeting } from "../types";

const NOW = new Date("2026-05-01T10:00:00Z");

function makeMeeting(overrides: Partial<Meeting> & { id: string }): Meeting {
  return {
    title: "Standup",
    startTime: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
    endTime: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    attendees: [],
    organizer: "you",
    ...overrides,
  };
}

function defaultOptions(overrides?: Partial<Parameters<typeof buildTrayMenuTemplate>[1]>) {
  return {
    onJoin: vi.fn(),
    onShowOverlay: vi.fn(),
    onShowSettings: vi.fn(),
    now: () => NOW.getTime(),
    ...overrides,
  };
}

/** Get meeting menu items (excludes separators, Show Flint, Quit). */
function getMeetingItems(template: ReturnType<typeof buildTrayMenuTemplate>) {
  const firstSepIdx = template.findIndex((item) => item.type === "separator");
  return template.slice(0, firstSepIdx);
}

describe("buildTrayMenuTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'No more meetings today' when there are no meetings", () => {
    const template = buildTrayMenuTemplate([], defaultOptions());
    const items = getMeetingItems(template);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("No more meetings today");
    expect(items[0].enabled).toBe(false);
  });

  it("shows a single meeting with time and title", () => {
    const meeting = makeMeeting({ id: "m1", title: "Sprint Planning" });
    const template = buildTrayMenuTemplate([meeting], defaultOptions());
    const items = getMeetingItems(template);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("Sprint Planning");
    expect(items[0].enabled).not.toBe(false);
  });

  it("shows multiple meetings sorted by start time", () => {
    const earlier = makeMeeting({
      id: "m1",
      title: "First",
      startTime: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    });
    const later = makeMeeting({
      id: "m2",
      title: "Second",
      startTime: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    });
    const template = buildTrayMenuTemplate([later, earlier], defaultOptions());
    const items = getMeetingItems(template);
    expect(items).toHaveLength(2);
    expect(items[0].label).toContain("First");
    expect(items[1].label).toContain("Second");
  });

  it("shows all-day events in a separate section with header", () => {
    const timed = makeMeeting({ id: "m1", title: "Timed" });
    const allDay = makeMeeting({
      id: "m2",
      title: "All Day Event",
      isAllDay: true,
      startTime: NOW.toISOString(),
      endTime: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
    });
    const template = buildTrayMenuTemplate([timed, allDay], defaultOptions());
    // All-day section: header + item + separator, then timed items
    expect(template[0].label).toBe("All day");
    expect(template[0].enabled).toBe(false);
    expect(template[1].label).toContain("All Day Event");
    expect(template[2].type).toBe("separator");
    // Timed meeting follows
    expect(template[3].label).toContain("Timed");
  });

  it("hides all-day events when showAllDay is false", () => {
    const timed = makeMeeting({ id: "m1", title: "Timed" });
    const allDay = makeMeeting({
      id: "m2",
      title: "Hidden Event",
      isAllDay: true,
      startTime: NOW.toISOString(),
      endTime: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
    });
    const template = buildTrayMenuTemplate(
      [timed, allDay],
      defaultOptions({ showAllDay: false }),
    );
    const labels = template.map((item) => item.label).filter(Boolean);
    expect(labels).not.toContain("All day");
    expect(labels.join(" ")).not.toContain("Hidden Event");
    expect(labels.join(" ")).toContain("Timed");
  });

  it("filters out past meetings (endTime before now)", () => {
    const past = makeMeeting({
      id: "m1",
      title: "Done",
      startTime: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
      endTime: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    });
    const future = makeMeeting({ id: "m2", title: "Future" });
    const template = buildTrayMenuTemplate([past, future], defaultOptions());
    const items = getMeetingItems(template);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("Future");
  });

  it("keeps in-progress meetings visible (started but not ended)", () => {
    const inProgress = makeMeeting({
      id: "m1",
      title: "In Progress",
      startTime: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
      endTime: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    });
    const template = buildTrayMenuTemplate([inProgress], defaultOptions());
    const items = getMeetingItems(template);
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain("In Progress");
  });

  it("calls onJoin with joinUrl when meeting has a join URL", () => {
    const opts = defaultOptions();
    const meeting = makeMeeting({ id: "m1", joinUrl: "https://teams.microsoft.com/join/123" });
    const template = buildTrayMenuTemplate([meeting], opts);
    const items = getMeetingItems(template);
    // Simulate click
    (items[0].click as () => void)();
    expect(opts.onJoin).toHaveBeenCalledWith("https://teams.microsoft.com/join/123");
    expect(opts.onShowOverlay).not.toHaveBeenCalled();
  });

  it("calls onShowOverlay when meeting has no joinUrl", () => {
    const opts = defaultOptions();
    const meeting = makeMeeting({ id: "m1" });
    const template = buildTrayMenuTemplate([meeting], opts);
    const items = getMeetingItems(template);
    (items[0].click as () => void)();
    expect(opts.onShowOverlay).toHaveBeenCalled();
    expect(opts.onJoin).not.toHaveBeenCalled();
  });

  it("truncates subject at 40 chars with ellipsis", () => {
    const exactly40 = "A".repeat(40);
    const exactly41 = "B".repeat(41);
    const opts = defaultOptions();

    const t1 = buildTrayMenuTemplate([makeMeeting({ id: "m1", title: exactly40 })], opts);
    const items1 = getMeetingItems(t1);
    expect(items1[0].label).toContain(exactly40);

    const t2 = buildTrayMenuTemplate([makeMeeting({ id: "m2", title: exactly41 })], opts);
    const items2 = getMeetingItems(t2);
    // Should end with ellipsis and NOT contain full title
    expect(items2[0].label).toContain("\u2026");
    expect(items2[0].label).not.toContain(exactly41);
  });

  it("escapes & in subject to prevent macOS accelerator interpretation", () => {
    const meeting = makeMeeting({ id: "m1", title: "Q&A Session" });
    const template = buildTrayMenuTemplate([meeting], defaultOptions());
    const items = getMeetingItems(template);
    expect(items[0].label).toContain("Q&&A Session");
  });

  it("strips control characters and zero-width chars from subject", () => {
    const meeting = makeMeeting({ id: "m1", title: "Hello\r\nWorld\u200B" });
    const template = buildTrayMenuTemplate([meeting], defaultOptions());
    const items = getMeetingItems(template);
    expect(items[0].label).toContain("HelloWorld");
    expect(items[0].label).not.toMatch(/[\r\n\u200B]/);
  });

  it("caps menu items at 10 with overflow indicator", () => {
    const meetings = Array.from({ length: 13 }, (_, i) =>
      makeMeeting({
        id: `m${String(i)}`,
        title: `Meeting ${String(i)}`,
        startTime: new Date(NOW.getTime() + (i + 1) * 10 * 60_000).toISOString(),
        endTime: new Date(NOW.getTime() + (i + 1) * 10 * 60_000 + 30 * 60_000).toISOString(),
      }),
    );
    const template = buildTrayMenuTemplate(meetings, defaultOptions());
    const items = getMeetingItems(template);
    // 10 meeting items + 1 "+N more" overflow
    expect(items).toHaveLength(11);
    expect(items[10].label).toBe("+3 more");
    expect(items[10].enabled).toBe(false);
  });

  it("always includes Show Flint, Settings, and Quit items after separator", () => {
    const template = buildTrayMenuTemplate([], defaultOptions());
    const labels = template.map((item) => item.label).filter(Boolean);
    expect(labels).toContain("Show Flint");
    expect(labels).toContain("Settings\u2026");
    expect(labels).toContain("Quit");
  });

  it("calls onShowSettings when Settings is clicked", () => {
    const opts = defaultOptions();
    const template = buildTrayMenuTemplate([], opts);
    const settingsItem = template.find((item) => item.label === "Settings\u2026");
    expect(settingsItem).toBeDefined();
    const click = settingsItem?.click as (() => void) | undefined;
    click?.();
    expect(opts.onShowSettings).toHaveBeenCalledTimes(1);
  });

  it("shows 'No more meetings today' when all meetings are past", () => {
    const past = makeMeeting({
      id: "m1",
      title: "Done",
      startTime: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
      endTime: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    });
    const template = buildTrayMenuTemplate([past], defaultOptions());
    const items = getMeetingItems(template);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("No more meetings today");
    expect(items[0].enabled).toBe(false);
  });
});

describe("updateTrayBadge", () => {
  it("sets tray title based on count, capped at 9+", () => {
    // Create tray so module-level tray is set
    createTray();
    mockSetTitle.mockClear();

    updateTrayBadge(3);
    expect(mockSetTitle).toHaveBeenLastCalledWith("3");

    updateTrayBadge(0);
    expect(mockSetTitle).toHaveBeenLastCalledWith("");

    updateTrayBadge(9);
    expect(mockSetTitle).toHaveBeenLastCalledWith("9");

    updateTrayBadge(10);
    expect(mockSetTitle).toHaveBeenLastCalledWith("9+");

    updateTrayBadge(99);
    expect(mockSetTitle).toHaveBeenLastCalledWith("9+");
  });
});

describe("countUpcomingMeetings", () => {
  it("counts only future and in-progress meetings", () => {
    const past = makeMeeting({
      id: "m1",
      startTime: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
      endTime: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    });
    const future = makeMeeting({ id: "m2" });
    const inProgress = makeMeeting({
      id: "m3",
      startTime: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
      endTime: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    });
    expect(countUpcomingMeetings([past, future, inProgress], () => NOW.getTime())).toBe(2);
  });

  it("includes all-day events for today", () => {
    const allDay = makeMeeting({
      id: "m1",
      isAllDay: true,
      startTime: NOW.toISOString(),
      endTime: new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString(),
    });
    expect(countUpcomingMeetings([allDay], () => NOW.getTime())).toBe(1);
  });

  it("excludes all-day events from yesterday", () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60_000);
    const allDay = makeMeeting({
      id: "m1",
      isAllDay: true,
      startTime: yesterday.toISOString(),
      endTime: NOW.toISOString(),
    });
    expect(countUpcomingMeetings([allDay], () => NOW.getTime())).toBe(0);
  });
});
