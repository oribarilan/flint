import { describe, it, expect, beforeEach } from "vitest";
import { useBlockStore } from "../blockStore";

describe("blockStore", () => {
  beforeEach(() => {
    useBlockStore.setState({ activeBlock: null, previousPillState: "briefing" });
  });

  it("starts with null activeBlock", () => {
    expect(useBlockStore.getState().activeBlock).toBeNull();
  });

  it("starts with briefing previousPillState", () => {
    expect(useBlockStore.getState().previousPillState).toBe("briefing");
  });

  it("setActiveBlock stores the block", () => {
    useBlockStore.getState().setActiveBlock({ type: "meeting-list", data: [] });
    expect(useBlockStore.getState().activeBlock).toEqual({ type: "meeting-list", data: [] });
  });

  it("setActiveBlock captures previous pill state", () => {
    // Set a meeting-card block first (meeting-focus state)
    useBlockStore.getState().setActiveBlock({
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Test",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
      },
    });

    // Now set another block — previousPillState should be meeting-focus
    useBlockStore.getState().setActiveBlock({ type: "meeting-list", data: [] });
    expect(useBlockStore.getState().previousPillState).toBe("meeting-focus");
  });

  it("setActiveBlock from null records briefing as previous", () => {
    useBlockStore.getState().setActiveBlock({ type: "meeting-list", data: [] });
    expect(useBlockStore.getState().previousPillState).toBe("briefing");
  });

  it("clearActiveBlock resets to null", () => {
    useBlockStore.getState().setActiveBlock({ type: "meeting-list", data: [] });
    useBlockStore.getState().clearActiveBlock();
    expect(useBlockStore.getState().activeBlock).toBeNull();
  });

  it("clearActiveBlock does not change previousPillState", () => {
    useBlockStore.getState().setActiveBlock({
      type: "meeting-card",
      data: {
        id: "m1",
        title: "Test",
        startTime: "2026-05-18T10:00:00Z",
        endTime: "2026-05-18T10:30:00Z",
        attendees: [],
        organizer: "Alice",
      },
    });

    useBlockStore.getState().setActiveBlock({ type: "meeting-list", data: [] });
    // previousPillState is meeting-focus
    useBlockStore.getState().clearActiveBlock();
    expect(useBlockStore.getState().previousPillState).toBe("meeting-focus");
  });
});
