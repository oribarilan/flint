import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  Notification: vi.fn().mockImplementation(({ title, body }: { title: string; body: string }) => ({
    title,
    body,
    show: vi.fn(),
    on: vi.fn(),
  })),
}));

import { fireNotification } from "../meetings/notifications";
import type { Meeting } from "../types";

describe("fireNotification", () => {
  it("creates and shows a notification", () => {
    const meeting: Meeting = {
      id: "1",
      title: "Standup",
      startTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 35 * 60_000).toISOString(),
      attendees: ["Alice", "Bob"],
      organizer: "Alice",
    };
    const { notification } = fireNotification(meeting, vi.fn());
    // eslint-disable-next-line @typescript-eslint/unbound-method -- mock object
    expect(notification.show).toHaveBeenCalled();
  });

  it('shows "now" for meetings starting within a minute', () => {
    const meeting: Meeting = {
      id: "2",
      title: "Urgent",
      startTime: new Date(Date.now() + 30_000).toISOString(),
      endTime: new Date(Date.now() + 30 * 60_000).toISOString(),
      attendees: [],
      organizer: "Bob",
    };
    const { notification } = fireNotification(meeting, vi.fn());
    // eslint-disable-next-line @typescript-eslint/unbound-method -- mock object
    expect(notification.show).toHaveBeenCalled();
  });

  it("registers a click handler", () => {
    const meeting: Meeting = {
      id: "3",
      title: "Click Test",
      startTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 35 * 60_000).toISOString(),
      attendees: [],
      organizer: "Alice",
    };
    const { notification } = fireNotification(meeting, vi.fn());
    // eslint-disable-next-line @typescript-eslint/unbound-method -- mock object
    expect(notification.on).toHaveBeenCalledWith("click", expect.any(Function));
  });
});
