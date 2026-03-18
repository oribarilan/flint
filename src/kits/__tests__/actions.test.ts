import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KitSearchResult, KitAction } from "../types";

// Mock commands before importing the module under test
vi.mock("../../lib/commands", () => ({
  openFile: vi.fn(() => Promise.resolve()),
  hideWindow: vi.fn(() => Promise.resolve()),
  executeCommand: vi.fn(() => Promise.resolve({ type: "Done" })),
  revealInFileManager: vi.fn(() => Promise.resolve()),
  deleteToTrash: vi.fn(() => Promise.resolve()),
  openInEditor: vi.fn(() => Promise.resolve()),
  openInTerminal: vi.fn(() => Promise.resolve()),
}));

import { executeAction, executeDefaultAction } from "../../components/ResultsList";
import {
  openFile,
  hideWindow,
  executeCommand,
  revealInFileManager,
  deleteToTrash,
  openInEditor,
} from "../../lib/commands";
import { useSearchStore } from "../../stores/searchStore";

const mockedOpenFile = vi.mocked(openFile);
const mockedHideWindow = vi.mocked(hideWindow);
const mockedExecuteCommand = vi.mocked(executeCommand);
const mockedReveal = vi.mocked(revealInFileManager);
const mockedDelete = vi.mocked(deleteToTrash);
const mockedOpenEditor = vi.mocked(openInEditor);

beforeEach(() => {
  vi.resetAllMocks();
  mockedOpenFile.mockResolvedValue(undefined);
  mockedHideWindow.mockResolvedValue(undefined);
  mockedExecuteCommand.mockResolvedValue({ type: "Done" });
  useSearchStore.setState({
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
    activeCommand: null,
  });
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

  it("activates command chip for ActivateCommand action", () => {
    const action: KitAction = {
      type: "ActivateCommand",
      kit_id: "calculator",
      command_id: "calculate",
    };
    executeAction(action);

    const state = useSearchStore.getState();
    expect(state.activeCommand).toEqual({
      kitId: "calculator",
      commandId: "calculate",
      name: "calculate",
    });
  });

  it("does not crash on unimplemented action types", () => {
    const action: KitAction = { type: "OpenApp" };
    expect(() => {
      executeAction(action);
    }).not.toThrow();
  });
});

describe("executeDefaultAction", () => {
  it("executes first action from result", async () => {
    const result: KitSearchResult = {
      kitId: "core",
      id: "1",
      title: "test",
      kind: { type: "File" },
      actions: [{ type: "Open", target: "/tmp/test.txt" }],
    };

    executeDefaultAction(result);

    await vi.waitFor(() => {
      expect(mockedOpenFile).toHaveBeenCalledWith("/tmp/test.txt");
    });
  });

  it("activates command with result title/icon for ActivateCommand", () => {
    const result: KitSearchResult = {
      kitId: "calculator",
      id: "cmd-discovery:calculator:calculate",
      title: "Calculator",
      icon: { type: "Emoji", value: "🧮" },
      kind: {
        type: "Command",
        kit_id: "calculator",
        command_id: "calculate",
        mode: "InputResults",
      },
      actions: [{ type: "ActivateCommand", kit_id: "calculator", command_id: "calculate" }],
    };

    executeDefaultAction(result);

    const state = useSearchStore.getState();
    expect(state.activeCommand).toEqual({
      kitId: "calculator",
      commandId: "calculate",
      name: "Calculator",
      icon: { type: "Emoji", value: "🧮" },
    });
  });

  it("calls executeCommand IPC for Execute-mode command results", async () => {
    const result: KitSearchResult = {
      kitId: "clipboard",
      id: "cmd-clear",
      title: "Clear Clipboard",
      kind: { type: "Command", kit_id: "clipboard", command_id: "clear", mode: "Execute" },
      actions: [{ type: "ActivateCommand", kit_id: "clipboard", command_id: "clear" }],
    };

    executeDefaultAction(result);

    await vi.waitFor(() => {
      expect(mockedExecuteCommand).toHaveBeenCalledWith("clipboard", "clear");
    });
  });

  it("does nothing when result has no actions", () => {
    const result: KitSearchResult = {
      kitId: "core",
      id: "1",
      title: "test",
      kind: { type: "File" },
      actions: [],
    };

    expect(() => {
      executeDefaultAction(result);
    }).not.toThrow();
    expect(mockedOpenFile).not.toHaveBeenCalled();
  });
});

describe("executeAction — new action types", () => {
  it("reveals file in file manager", async () => {
    const action: KitAction = { type: "RevealInFileManager", target: "/tmp/test.txt" };
    executeAction(action);
    await vi.waitFor(() => {
      expect(mockedReveal).toHaveBeenCalledWith("/tmp/test.txt");
    });
  });

  it("copies path to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const action: KitAction = { type: "CopyPath", path: "/tmp/test.txt" };
    executeAction(action);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("/tmp/test.txt");
    });
  });

  it("copies name to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const action: KitAction = { type: "CopyName", name: "test.txt" };
    executeAction(action);
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("test.txt");
    });
  });

  it("deletes file to trash", async () => {
    const action: KitAction = { type: "Delete", target: "/tmp/test.txt" };
    executeAction(action);
    await vi.waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith("/tmp/test.txt");
    });
  });

  it("opens file in editor", async () => {
    const action: KitAction = { type: "OpenInEditor", target: "/tmp/test.rs" };
    executeAction(action);
    await vi.waitFor(() => {
      expect(mockedOpenEditor).toHaveBeenCalledWith("/tmp/test.rs");
    });
  });
});
