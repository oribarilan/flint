import { describe, it, expect } from "vitest";
import {
  selectDisplayMeeting,
  formatMenubarText,
  ACTIVE_THRESHOLD_MS,
} from "../lib/menubar-format";
import type { Meeting } from "../types";

const NOW = new Date("2026-05-01T10:00:00Z");
const NOW_MS = NOW.getTime();

function makeMeeting(overrides: Partial<Meeting> & { id: string }): Meeting {
  return {
    title: "Standup",
    startTime: new Date(NOW_MS + 30 * 60_000).toISOString(),
    endTime: new Date(NOW_MS + 60 * 60_000).toISOString(),
    attendees: [],
    organizer: "you",
    ...overrides,
  };
}

// ── selectDisplayMeeting ──

describe("selectDisplayMeeting", () => {
  it("returns null for empty meetings", () => {
    expect(selectDisplayMeeting([], NOW_MS)).toBeNull();
  });

  it("returns the next upcoming meeting (not started yet)", () => {
    const m = makeMeeting({ id: "1" });
    const result = selectDisplayMeeting([m], NOW_MS);
    expect(result).toEqual({ meeting: m, isActive: false });
  });

  it("returns an active meeting (started within 10 min, not ended)", () => {
    const m = makeMeeting({
      id: "1",
      startTime: new Date(NOW_MS - 5 * 60_000).toISOString(),
      endTime: new Date(NOW_MS + 25 * 60_000).toISOString(),
    });
    const result = selectDisplayMeeting([m], NOW_MS);
    expect(result).toEqual({ meeting: m, isActive: true });
  });

  it("skips a meeting that started more than 10 min ago (returns next upcoming)", () => {
    const old = makeMeeting({
      id: "old",
      startTime: new Date(NOW_MS - ACTIVE_THRESHOLD_MS - 1).toISOString(),
      endTime: new Date(NOW_MS + 20 * 60_000).toISOString(),
    });
    const next = makeMeeting({
      id: "next",
      startTime: new Date(NOW_MS + 15 * 60_000).toISOString(),
      endTime: new Date(NOW_MS + 45 * 60_000).toISOString(),
    });
    const result = selectDisplayMeeting([old, next], NOW_MS);
    expect(result).toEqual({ meeting: next, isActive: false });
  });

  it("skips ended meetings even if within 10 min threshold", () => {
    const ended = makeMeeting({
      id: "ended",
      startTime: new Date(NOW_MS - 5 * 60_000).toISOString(),
      endTime: new Date(NOW_MS - 1).toISOString(), // already ended
    });
    const result = selectDisplayMeeting([ended], NOW_MS);
    expect(result).toBeNull();
  });

  it("prefers non-all-day meetings over all-day", () => {
    const allDay = makeMeeting({ id: "allday", isAllDay: true });
    const timed = makeMeeting({
      id: "timed",
      startTime: new Date(NOW_MS + 60 * 60_000).toISOString(),
      endTime: new Date(NOW_MS + 90 * 60_000).toISOString(),
    });
    const result = selectDisplayMeeting([allDay, timed], NOW_MS);
    expect(result?.meeting.id).toBe("timed");
    expect(result?.isActive).toBe(false);
  });

  it("returns null when only all-day events exist", () => {
    const allDay = makeMeeting({ id: "allday", isAllDay: true, title: "Company Offsite" });
    const result = selectDisplayMeeting([allDay], NOW_MS);
    expect(result).toBeNull();
  });

  it("returns the earliest upcoming meeting when multiple exist", () => {
    const later = makeMeeting({
      id: "later",
      startTime: new Date(NOW_MS + 120 * 60_000).toISOString(),
      endTime: new Date(NOW_MS + 150 * 60_000).toISOString(),
    });
    const sooner = makeMeeting({
      id: "sooner",
      startTime: new Date(NOW_MS + 15 * 60_000).toISOString(),
      endTime: new Date(NOW_MS + 45 * 60_000).toISOString(),
    });
    // Pass later first to verify sorting, not insertion order
    const result = selectDisplayMeeting([later, sooner], NOW_MS);
    expect(result?.meeting.id).toBe("sooner");
  });
});

// ── formatMenubarText ──

describe("formatMenubarText", () => {
  it("returns empty string when display is null", () => {
    expect(formatMenubarText(null, "countdown", true, NOW_MS)).toBe("");
  });

  it("countdown: shows 'in Xm' format with correct minutes", () => {
    const m = makeMeeting({
      id: "1",
      startTime: new Date(NOW_MS + 25 * 60_000).toISOString(),
    });
    const text = formatMenubarText({ meeting: m, isActive: false }, "countdown", false, NOW_MS);
    expect(text).toBe("in 25m");
  });

  it("countdown: shows 'now' when meeting is active", () => {
    const m = makeMeeting({ id: "1" });
    const text = formatMenubarText({ meeting: m, isActive: true }, "countdown", false, NOW_MS);
    expect(text).toBe("now");
  });

  it("next-time: shows formatted start time", () => {
    const m = makeMeeting({
      id: "1",
      startTime: new Date(NOW_MS + 30 * 60_000).toISOString(),
    });
    const text = formatMenubarText({ meeting: m, isActive: false }, "next-time", false, NOW_MS);
    // The exact format depends on locale, but it should be a non-empty time string
    expect(text).toBeTruthy();
    expect(text).not.toBe("now");
  });

  it("next-time: shows 'now' when active", () => {
    const m = makeMeeting({ id: "1" });
    const text = formatMenubarText({ meeting: m, isActive: true }, "next-time", false, NOW_MS);
    expect(text).toBe("now");
  });

  it("time off + title on: shows just the title", () => {
    const m = makeMeeting({ id: "1", title: "Design Review" });
    const text = formatMenubarText({ meeting: m, isActive: false }, "off", true, NOW_MS);
    expect(text).toBe("Design Review");
  });

  it("time on + title on: joins with ' · ' separator", () => {
    const m = makeMeeting({ id: "1", title: "Sync" });
    const text = formatMenubarText({ meeting: m, isActive: true }, "countdown", true, NOW_MS);
    expect(text).toBe("now \u00b7 Sync");
  });

  it("time on + title off: shows just the time", () => {
    const m = makeMeeting({ id: "1" });
    const text = formatMenubarText({ meeting: m, isActive: true }, "countdown", false, NOW_MS);
    expect(text).toBe("now");
  });

  it("truncates long titles (over 16 chars) with ellipsis", () => {
    const m = makeMeeting({ id: "1", title: "A Very Long Meeting Title Here" });
    const text = formatMenubarText({ meeting: m, isActive: false }, "off", true, NOW_MS);
    expect(text.length).toBeLessThanOrEqual(16);
    expect(text).toContain("\u2026");
  });
});
