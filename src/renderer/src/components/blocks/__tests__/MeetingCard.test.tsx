// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MeetingCard } from "../MeetingCard";
import type { MeetingCardData } from "../../../../../main/lib/blocks";

const baseMeeting: MeetingCardData = {
  id: "m1",
  title: "Q4 Planning",
  startTime: "2026-05-18T14:00:00Z",
  endTime: "2026-05-18T15:00:00Z",
  attendees: ["Bob", "Carol"],
  organizer: "Alice",
};

describe("MeetingCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders meeting title", () => {
    render(<MeetingCard data={baseMeeting} />);
    expect(screen.getByText("Q4 Planning")).toBeTruthy();
  });

  it("renders organizer and attendee count", () => {
    render(<MeetingCard data={baseMeeting} />);
    const card = screen.getByTestId("meeting-card");
    expect(card.textContent).toContain("Alice");
    expect(card.textContent).toContain("+ 2");
  });

  it("renders time range for non-all-day meetings", () => {
    render(<MeetingCard data={baseMeeting} />);
    const card = screen.getByTestId("meeting-card");
    // Contains en-dash separator between start and end time
    expect(card.textContent).toContain("–");
  });

  it("renders 'All day' for all-day events", () => {
    render(<MeetingCard data={{ ...baseMeeting, isAllDay: true }} />);
    expect(screen.getByText("All day")).toBeTruthy();
  });

  it("renders agenda when present", () => {
    render(<MeetingCard data={{ ...baseMeeting, agenda: "Review goals" }} />);
    expect(screen.getByText("Review goals")).toBeTruthy();
  });

  it("does not render agenda section when absent", () => {
    render(<MeetingCard data={baseMeeting} />);
    const card = screen.getByTestId("meeting-card");
    expect(card.textContent).not.toContain("Agenda");
  });

  it("renders AI prep notes when present", () => {
    render(<MeetingCard data={{ ...baseMeeting, aiPrep: ["Bring slides", "Check metrics"] }} />);
    expect(screen.getByText("Bring slides")).toBeTruthy();
    expect(screen.getByText("Check metrics")).toBeTruthy();
  });

  it("does not render prep section when aiPrep is empty", () => {
    render(<MeetingCard data={{ ...baseMeeting, aiPrep: [] }} />);
    const card = screen.getByTestId("meeting-card");
    expect(card.textContent).not.toContain("Prep notes");
  });
});
