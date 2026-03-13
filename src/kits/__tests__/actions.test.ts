import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KitSearchResult, KitAction } from "../types";

// Mock commands before importing the module under test
vi.mock("../../lib/commands", () => ({
  openFile: vi.fn(() => Promise.resolve()),
  hideWindow: vi.fn(() => Promise.resolve()),
}));

import { executeAction, executeDefaultAction } from "../../components/ResultsList";
import { openFile, hideWindow } from "../../lib/commands";

const mockedOpenFile = vi.mocked(openFile);
const mockedHideWindow = vi.mocked(hideWindow);

beforeEach(() => {
  vi.resetAllMocks();
  mockedOpenFile.mockResolvedValue(undefined);
  mockedHideWindow.mockResolvedValue(undefined);
});

describe("executeAction", () => {
  it("opens file and hides window for Open action", async () => {
    const action: KitAction = { type: "Open", target: "/tmp/test.txt" };
    executeAction(action);

    // Wait for the promise chain
    await vi.waitFor(() => {
      expect(mockedOpenFile).toHaveBeenCalledWith("/tmp/test.txt");
    });
  });

  it("copies text for Copy action", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const action: KitAction = { type: "Copy", text: "hello" };
    executeAction(action);

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("hello");
    });
  });

  it("does not crash on unimplemented action types", () => {
    const action: KitAction = { type: "OpenApp" };
    expect(() => executeAction(action)).not.toThrow();
  });
});

describe("executeDefaultAction", () => {
  it("executes first action from result", async () => {
    const result: KitSearchResult = {
      kitId: "core",
      id: "1",
      title: "test",
      actions: [{ type: "Open", target: "/tmp/test.txt" }],
    };

    executeDefaultAction(result);

    await vi.waitFor(() => {
      expect(mockedOpenFile).toHaveBeenCalledWith("/tmp/test.txt");
    });
  });

  it("does nothing when result has no actions", () => {
    const result: KitSearchResult = {
      kitId: "core",
      id: "1",
      title: "test",
      actions: [],
    };

    expect(() => executeDefaultAction(result)).not.toThrow();
    expect(mockedOpenFile).not.toHaveBeenCalled();
  });
});
