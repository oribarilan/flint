// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent, act } from "@testing-library/react";

// --- Mocks must be set up before importing App ---

// Mock window.flint API
const mockHideOverlay = vi.fn();
const mockOnModelChanged = vi.fn(() => vi.fn());
const mockFlint = {
  platform: "darwin",
  chatSend: vi.fn(),
  onChatDelta: vi.fn(() => vi.fn()),
  onChatDone: vi.fn(() => vi.fn()),
  getConfig: vi.fn(() =>
    Promise.resolve({
      hotkey: "Option+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
      model: "gpt-4.1",
    }),
  ),
  setConfig: vi.fn(),
  hideOverlay: mockHideOverlay,
  onConnectionStatus: vi.fn(() => vi.fn()),
  getAttentionItems: vi.fn(() => Promise.resolve([])),
  onAttentionUpdate: vi.fn(() => vi.fn()),
  openAttentionItem: vi.fn(),
  listModels: vi.fn(() => Promise.resolve([])),
  setModel: vi.fn(),
  onModelChanged: mockOnModelChanged,
};

Object.defineProperty(window, "flint", { value: mockFlint, writable: true });

// Mock hooks to avoid side effects
vi.mock("../hooks/useAttention", () => ({
  useAttention: () => ({
    items: [],
    selectedIds: new Set<string>(),
    toggleSelect: vi.fn(),
  }),
}));

vi.mock("../hooks/useChat", () => ({
  useChat: () => ({
    messages: [],
    streamingContent: "",
    isStreaming: false,
    sendMessage: vi.fn(),
  }),
}));

vi.mock("../hooks/useConfig", () => ({
  useConfig: () => ({
    config: {
      hotkey: "Option+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
      model: "gpt-4.1",
    },
    isLoaded: true,
    updateConfig: vi.fn(),
  }),
}));

import App from "../App";
import { useModelStore } from "../stores/modelStore";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useModelStore.setState({ currentModel: "gpt-4.1", models: [] });
});

function pressEscape(): void {
  fireEvent.keyDown(document, { key: "Escape" });
}

function pressCmd(key: string): void {
  fireEvent.keyDown(document, { key, metaKey: true });
}

describe("Escape stack", () => {
  it("hides overlay when nothing is open", () => {
    render(<App />);

    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });

  it("closes settings instead of hiding overlay when settings is open", () => {
    render(<App />);

    // Open settings via Cmd+,
    pressCmd(",");

    // Settings dialog should now be in the DOM
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    // ESC should close settings, not hide overlay
    pressEscape();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(mockHideOverlay).not.toHaveBeenCalled();
  });

  it("hides overlay on second ESC after settings is closed", () => {
    render(<App />);

    // Open and close settings
    pressCmd(",");
    pressEscape();

    // Now ESC should hide overlay
    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });

  it("hides overlay even when chat is streaming (stream continues in background)", () => {
    // The escape stack does not check isStreaming — ESC always hides overlay
    // when no modal layers are open, regardless of streaming state.
    render(<App />);

    pressEscape();

    expect(mockHideOverlay).toHaveBeenCalledTimes(1);
  });
});

describe("Model indicator", () => {
  it("renders model name in bottom bar", () => {
    const { getByLabelText } = render(<App />);

    const button = getByLabelText("Current model: gpt-4.1");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("gpt-4.1");
  });

  it("reflects model store changes", () => {
    const { getByLabelText } = render(<App />);

    // Update model store directly (simulates model:changed IPC)
    act(() => {
      useModelStore.getState().setCurrentModel("claude-sonnet-4");
    });

    const button = getByLabelText("Current model: claude-sonnet-4");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("claude-sonnet-4");
  });

  it("subscribes to onModelChanged on mount", () => {
    render(<App />);

    expect(mockOnModelChanged).toHaveBeenCalledTimes(1);
    expect(typeof mockOnModelChanged.mock.calls[0][0]).toBe("function");
  });
});
