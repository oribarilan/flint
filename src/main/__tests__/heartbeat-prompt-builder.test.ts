import { describe, it, expect } from "vitest";
import { buildBeatPrompt, buildPrepPrompt } from "../heartbeat/prompt-builder";
import type { Meeting } from "../types";

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    title: "Design Review",
    startTime: "2026-05-19T14:00:00Z",
    endTime: "2026-05-19T15:00:00Z",
    attendees: ["Alice", "Bob"],
    organizer: "Alice",
    ...overrides,
  };
}

describe("buildBeatPrompt", () => {
  const now = new Date("2026-05-19T13:45:00Z");

  it("includes current time", () => {
    const prompt = buildBeatPrompt([], new Set(), now);
    expect(prompt).toContain("2026-05-19T13:45:00");
  });

  it("shows 'none' when no meetings are prepped", () => {
    const prompt = buildBeatPrompt([makeMeeting()], new Set(), now);
    expect(prompt).toContain("Already prepped: none");
  });

  it("lists prepped meeting IDs", () => {
    const prompt = buildBeatPrompt([makeMeeting()], new Set(["m1"]), now);
    expect(prompt).toContain("Already prepped: m1");
  });

  it("includes meeting details", () => {
    const prompt = buildBeatPrompt([makeMeeting()], new Set(), now);
    expect(prompt).toContain('"m1"');
    expect(prompt).toContain('"Design Review"');
    expect(prompt).toContain("2 attendees");
  });

  it("filters out all-day meetings", () => {
    const meeting = makeMeeting({ isAllDay: true, title: "Holiday" });
    const prompt = buildBeatPrompt([meeting], new Set(), now);
    expect(prompt).not.toContain("Holiday");
  });

  it("handles empty meeting list", () => {
    const prompt = buildBeatPrompt([], new Set(), now);
    expect(prompt).toContain("No meetings today");
  });

  it("pluralizes attendee count correctly for singular", () => {
    const meeting = makeMeeting({ attendees: ["Alice"] });
    const prompt = buildBeatPrompt([meeting], new Set(), now);
    expect(prompt).toContain("1 attendee");
    expect(prompt).not.toContain("1 attendees");
  });
});

describe("buildPrepPrompt", () => {
  const now = new Date("2026-05-19T13:45:00Z");

  it("includes meeting ID and title", () => {
    const prompt = buildPrepPrompt(makeMeeting(), now);
    expect(prompt).toContain('"m1"');
    expect(prompt).toContain('"Design Review"');
  });

  it("includes current time", () => {
    const prompt = buildPrepPrompt(makeMeeting(), now);
    expect(prompt).toContain("2026-05-19T13:45:00");
  });

  it("instructs to call cache_meeting_prep", () => {
    const prompt = buildPrepPrompt(makeMeeting(), now);
    expect(prompt).toContain("cache_meeting_prep");
  });
});
