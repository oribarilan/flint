// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent, screen } from "@testing-library/react";

// --- Mocks must be set up before importing App ---

// Mock window.flint API
const mockHideOverlay = vi.fn();
const mockChatReset = vi.fn(() => Promise.resolve());
const mockOnModelChanged = vi.fn((_callback: (modelId: string) => void) => vi.fn());
const mockFlint = {
  platform: "darwin",
  chatSend: vi.fn(),
  chatReset: mockChatReset,
  onChatDelta: vi.fn(() => vi.fn()),
  onChatDone: vi.fn(() => vi.fn()),
  getConfig: vi.fn(() =>
    Promise.resolve({
      hotkey: "Ctrl+Shift+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
      model: "gpt-4.1",
      fontSize: "medium",
      theme: "dark",
    }),
  ),
  setConfig: vi.fn(),
  hideOverlay: mockHideOverlay,
  onConnectionStatus: vi.fn(() => vi.fn()),
  getAttentionItems: vi.fn(() => Promise.resolve([])),
  onAttentionUpdate: vi.fn(() => vi.fn()),
  openAttentionItem: vi.fn(),
  openLink: vi.fn(),
  testNotification: vi.fn(),
  listModels: vi.fn(() => Promise.resolve([])),
  setModel: vi.fn(),
  onModelChanged: mockOnModelChanged,
  onThemeChanged: vi.fn((_callback: (theme: string) => void) => vi.fn()),
};

Object.defineProperty(window, "flint", { value: mockFlint, writable: true });

// Mock hooks to avoid side effects
const mockItems: { id: string; title: string; icon: string; source: string }[] = [];
vi.mock("../hooks/useAttention", () => ({
  useAttention: () => ({
    items: mockItems,
    selectedIds: new Set<string>(),
    toggleSelect: vi.fn(),
  }),
}));

const mockClearMessages = vi.fn();

const mockChatState = {
  messages: [] as { role: string; content: string }[],
  streamingContent: "",
  isStreaming: false,
  sendMessage: vi.fn(),
  clearMessages: mockClearMessages,
};

vi.mock("../hooks/useChat", () => ({
  useChat: () => mockChatState,
}));

vi.mock("../hooks/useConfig", () => ({
  useConfig: () => ({
    config: {
      hotkey: "Ctrl+Shift+Space",
      alertMinutes: 5,
      launchAtLogin: true,
      showTrayIcon: true,
      model: "gpt-4.1",
      fontSize: "medium",
    },
    isLoaded: true,
    updateConfig: vi.fn(),
  }),
}));

const mockMeetings = [
  {
    id: "m1",
    subject: "Standup",
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 1800000).toISOString(),
    isImminentlyStarting: false,
    joinUrl: "https://teams.example.com/join",
    organizer: "Alice",
    attendees: [],
  },
];

vi.mock("../hooks/useMeetings", () => ({
  useMeetings: () => mockMeetings,
}));

// Mock child components to keep tests focused on App layout/behavior
vi.mock("../components/Greeting", () => ({
  Greeting: () => <div data-testid="greeting">Greeting</div>,
}));
vi.mock("../components/MeetingRow", () => ({
  MeetingRow: ({ meeting }: { meeting: { id: string } }) => (
    <div data-testid={`meeting-row-${meeting.id}`}>MeetingRow</div>
  ),
}));
vi.mock("../components/AttentionRow", () => ({
  AttentionRow: ({ item }: { item: { id: string } }) => (
    <div data-testid={`attention-row-${item.id}`}>AttentionRow</div>
  ),
}));
vi.mock("../components/ChatPanel", () => ({
  ChatPanel: vi.fn().mockImplementation(() => <div data-testid="chat-panel">ChatPanel</div>),
}));

import App from "../App";
import { useModelStore } from "../stores/modelStore";
import { useAttentionStore } from "../stores/attentionStore";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useModelStore.setState({ currentModel: "gpt-4.1", models: [] });
  useAttentionStore.setState({ items: [], selectedIds: new Set() });
  // Reset chat mock state
  mockChatState.messages = [];
  mockChatState.streamingContent = "";
  mockChatState.isStreaming = false;
  mockChatState.sendMessage = vi.fn();
  mockChatState.clearMessages = mockClearMessages;
  // Reset items
  mockItems.length = 0;
});

describe("Popover structure", () => {
  it("renders the app root", () => {
    render(<App />);
    expect(screen.getByTestId("app-root")).toBeTruthy();
  });

  it("renders the Greeting component in briefing view", () => {
    render(<App />);
    expect(screen.getByTestId("greeting")).toBeTruthy();
  });

  it("renders the chat input in briefing view", () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/Ask Flint anything/);
    expect(input).toBeTruthy();
  });

  it("renders meeting rows when meetings exist", () => {
    render(<App />);
    expect(screen.getByTestId("meeting-row-m1")).toBeTruthy();
  });

  it("renders attention rows when items exist", () => {
    mockItems.push({ id: "a1", title: "Respond to email", icon: "mail", source: "outlook" });
    render(<App />);
    expect(screen.getByTestId("attention-row-a1")).toBeTruthy();
  });

  it("shows empty state when no meetings or attention items", () => {
    // Clear mock meetings
    mockMeetings.length = 0;
    render(<App />);
    expect(screen.getByText("All clear")).toBeTruthy();
    // Restore for other tests
    mockMeetings.push({
      id: "m1",
      subject: "Standup",
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 1800000).toISOString(),
      isImminentlyStarting: false,
      joinUrl: "https://teams.example.com/join",
      organizer: "Alice",
      attendees: [],
    });
  });
});

describe("View toggling", () => {
  it("switches to chat view when a message is sent", () => {
    // Make sendMessage trigger the view change by calling the real handleSend
    mockChatState.sendMessage = vi.fn();
    render(<App />);

    const input = screen.getByPlaceholderText(/Ask Flint anything/);
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // handleSend calls sendMessage and setView("chat")
    // Since mockChatState.sendMessage is called, chat view should show
    // The ChatInput calls onSend which is handleSend in briefing view
    expect(mockChatState.sendMessage).toHaveBeenCalledWith("Hello");
  });

  it("shows back button in chat view", () => {
    // Trigger chat view by sending a message
    render(<App />);

    const input = screen.getByPlaceholderText(/Ask Flint anything/);
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const backButton = screen.getByLabelText("Back to briefing");
    expect(backButton).toBeTruthy();
  });

  it("returns to briefing view when back button is clicked", () => {
    render(<App />);

    // Go to chat view
    const input = screen.getByPlaceholderText(/Ask Flint anything/);
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Click back
    const backButton = screen.getByLabelText("Back to briefing");
    fireEvent.click(backButton);

    // Should be back in briefing view
    expect(screen.getByTestId("greeting")).toBeTruthy();
    expect(mockClearMessages).toHaveBeenCalled();
  });
});

describe("Focus input on overlay show", () => {
  function fireWindowFocus(): void {
    window.dispatchEvent(new Event("focus"));
  }

  it("focuses chat input when window receives focus", () => {
    render(<App />);

    // Blur any focused element to simulate returning to the overlay
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    fireWindowFocus();

    const input = screen.getByPlaceholderText(/Ask Flint anything/);
    expect(document.activeElement).toBe(input);
  });

  it("focuses chat input even when streaming is in progress", () => {
    mockChatState.messages = [{ role: "user", content: "test" }];
    mockChatState.streamingContent = "streaming...";
    mockChatState.isStreaming = true;

    render(<App />);

    (document.activeElement as HTMLElement | null)?.blur();

    fireWindowFocus();

    const input = screen.getByPlaceholderText(/Ask Flint anything/);
    expect(document.activeElement).toBe(input);
  });

  it("cleans up window focus listener on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<App />);

    const focusCalls = addSpy.mock.calls.filter(([event]) => event === "focus");
    expect(focusCalls.length).toBeGreaterThan(0);

    const handler = focusCalls[focusCalls.length - 1][1];

    unmount();

    const removesCalls = removeSpy.mock.calls.filter(([event]) => event === "focus");
    const removed = removesCalls.some(([, h]) => h === handler);
    expect(removed).toBe(true);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("Model sync", () => {
  it("subscribes to onModelChanged on mount", () => {
    render(<App />);

    expect(mockOnModelChanged).toHaveBeenCalledTimes(1);
    expect(typeof mockOnModelChanged.mock.calls[0][0]).toBe("function");
  });

  it("syncs model from config on load", () => {
    render(<App />);

    // useConfig returns model: "gpt-4.1", which should be synced to store
    expect(useModelStore.getState().currentModel).toBe("gpt-4.1");
  });
});

describe("Theme and font size", () => {
  it("sets data-fontSize attribute from config", () => {
    render(<App />);

    expect(document.documentElement.dataset.fontSize).toBe("medium");
  });

  it("subscribes to theme changes on mount", () => {
    render(<App />);

    expect(mockFlint.onThemeChanged).toHaveBeenCalledTimes(1);
  });
});
