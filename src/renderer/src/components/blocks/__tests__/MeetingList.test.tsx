// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../MeetingRow", () => ({
  MeetingRow: ({ meeting }: { meeting: { id: string } }) => (
    <div data-testid={`meeting-row-${meeting.id}`}>MeetingRow</div>
  ),
}));

import { MeetingList } from "../MeetingList";
import type { Meeting } from "../../../../../main/types";

describe("MeetingList", () => {
  const meetings: Meeting[] = [
    {
      id: "m1",
      title: "Standup",
      startTime: "2026-05-18T10:00:00Z",
      endTime: "2026-05-18T10:30:00Z",
      attendees: ["Bob"],
      organizer: "Alice",
    },
    {
      id: "m2",
      title: "Planning",
      startTime: "2026-05-18T11:00:00Z",
      endTime: "2026-05-18T12:00:00Z",
      attendees: [],
      organizer: "Carol",
    },
  ];

  it("renders a MeetingRow for each meeting", () => {
    const { getByTestId } = render(<MeetingList meetings={meetings} />);
    expect(getByTestId("meeting-row-m1")).toBeTruthy();
    expect(getByTestId("meeting-row-m2")).toBeTruthy();
  });

  it("renders nothing for empty array", () => {
    const { container } = render(<MeetingList meetings={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
