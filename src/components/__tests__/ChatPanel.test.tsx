import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useChatStore } from "../../stores/chatStore";
import { useSearchStore } from "../../stores/searchStore";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: vi.fn(),
  writable: true,
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../lib/commands", () => ({
  getAvailableModels: vi.fn(() => Promise.resolve([[], null])),
  getSessionMessages: vi.fn(() => Promise.resolve([])),
  getProjectModelConfigStatus: vi.fn(() =>
    Promise.resolve({ exists: false, has_model: false, model: null, path: "" }),
  ),
  setProjectDefaultModel: vi.fn(() => Promise.resolve()),
  openSettings: vi.fn(() => Promise.resolve()),
  initOpencode: vi.fn(() => Promise.resolve()),
  getChatStatus: vi.fn(() =>
    Promise.resolve({ connected: true, session_id: "session-1", repo_path: "/brain" }),
  ),
  // Dynamic imports in ChatPanel are also vi.mock'd via the static mock above.
  clearChat: vi.fn(() => Promise.resolve()),
  sendChatMessage: vi.fn(() => Promise.resolve()),
}));

// ChatPanel uses renderMarkdown — stub it to return plain text for assertions.
vi.mock("../../lib/markdown", () => ({
  renderMarkdown: (text: string) => text,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAT_STORE_DEFAULTS = {
  messages: [],
  isStreaming: false,
  currentResponse: "",
  activeToolCalls: [],
  chatStatus: { connected: false, sessionId: null, repoPath: null },
  statusChecked: false,
  selectedModel: null,
  modelPickerOpen: false,
  modelPickerMode: "session" as const,
  availableModels: [],
  defaultModelId: null,
  hasProjectDefaultModel: true,
  modelPickerQuery: "",
  modelPickerIndex: 0,
  modelPickerActionPanelOpen: false,
  modelPickerActionIndex: 0,
  slashMenuOpen: false,
  slashMenuIndex: 0,
  slashMenuDismissed: false,
  notice: null,
};

// Import after mocks are in place
import ChatPanel from "../ChatPanel";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useChatStore.setState(CHAT_STORE_DEFAULTS);
  useSearchStore.setState({ query: "", mode: "agent" });
});

afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
  });
  vi.runAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flush all pending promise microtasks inside act so async effects settle.
 * Runs enough ticks to resolve Promise.all chains (models + hydration).
 */
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Guard states
// ---------------------------------------------------------------------------

describe("ChatPanel — guard states", () => {
  it("renders blank panel while statusChecked is false", () => {
    useChatStore.setState({ statusChecked: false });
    const { container } = render(<ChatPanel />);
    // Should render the panel container but no content
    expect(container.firstChild).not.toBeNull();
    expect(screen.queryByText("Second Brain Doctor")).toBeNull();
    expect(screen.queryByText("Second Brain Not Connected")).toBeNull();
  });

  it("shows not-configured UI when repoPath is null", () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: false, sessionId: null, repoPath: null },
    });
    render(<ChatPanel />);

    expect(screen.getByText("Second Brain Not Connected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeTruthy();
  });

  it("Open Settings button calls openSettings command", async () => {
    const { openSettings } = await import("../../lib/commands");
    const mockedOpenSettings = vi.mocked(openSettings);

    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: false, sessionId: null, repoPath: null },
    });
    render(<ChatPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Empty / idle state
// ---------------------------------------------------------------------------

describe("ChatPanel — empty state", () => {
  it("shows empty state with suggestion buttons when configured and no messages", async () => {
    // sessionId: null prevents hydration effect from running; connected=true
    // triggers models load which safely returns [] and doesn't alter visible state.
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("Second Brain Doctor")).toBeTruthy();
    expect(screen.getByText("What did I work on this week?")).toBeTruthy();
    expect(screen.getByText("Find incomplete notes")).toBeTruthy();
    expect(screen.getByText("Project status summary")).toBeTruthy();
    expect(screen.getByText("Learning progress")).toBeTruthy();
  });

  it("shows connected status dot when connected", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    // Status dot has title "Connected"
    const dot = screen.getByTitle("Connected");
    expect(dot).toBeTruthy();
  });

  it("does not show status dot when disconnected", () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: false, sessionId: null, repoPath: "/brain" },
    });
    render(<ChatPanel />);

    expect(screen.queryByTitle("Connected")).toBeNull();
  });

  it("shows selected model name in header when model is set", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      selectedModel: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4",
        displayName: "Claude Sonnet 4",
      },
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("Claude Sonnet 4")).toBeTruthy();
  });

  it("shows fallback when no model is configured", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      selectedModel: null,
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("No model configured")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Messages rendering
// ---------------------------------------------------------------------------

describe("ChatPanel — message rendering", () => {
  // Use sessionId: null to prevent the hydration effect from replacing
  // pre-set messages with the empty mock response from getSessionMessages.
  async function renderWithMessages() {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      messages: [
        { role: "user", content: "Hello AI" },
        { role: "assistant", content: "Hello human" },
        { role: "error", content: "Something went wrong" },
      ],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();
  }

  it("renders user messages", async () => {
    await renderWithMessages();
    expect(screen.getByText("Hello AI")).toBeTruthy();
  });

  it("renders assistant messages", async () => {
    await renderWithMessages();
    expect(screen.getByText("Hello human")).toBeTruthy();
  });

  it("renders error messages", async () => {
    await renderWithMessages();
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("shows New Chat button when messages exist", async () => {
    // Use sessionId: null so hydration does not clear the pre-set message.
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      messages: [{ role: "user", content: "hi" }],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
  });

  it("hides New Chat button when no messages and not streaming", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      messages: [],
      isStreaming: false,
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Streaming state
// ---------------------------------------------------------------------------

describe("ChatPanel — streaming state", () => {
  it("shows thinking dots when streaming with no current response and no active tools", async () => {
    // sessionId: null prevents hydration; streaming state is preserved.
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      currentResponse: "",
      activeToolCalls: [],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByLabelText("Thinking")).toBeTruthy();
  });

  it("shows current response text when streaming with content", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      currentResponse: "Partial response...",
      activeToolCalls: [],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("Partial response...")).toBeTruthy();
    expect(screen.queryByLabelText("Thinking")).toBeNull();
  });

  it("shows New Chat button when streaming", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      currentResponse: "",
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
  });

  it("shows connection retry notice when disconnected", () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: false, sessionId: null, repoPath: "/brain" },
    });
    render(<ChatPanel />);

    expect(screen.getByText(/OpenCode is disconnected/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("renders warning notice and allows dismiss", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      notice: { level: "warning", message: "Chat reset failed. Retrying…" },
    });

    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();
    expect(screen.getByText("Chat reset failed. Retrying…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(useChatStore.getState().notice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tool call display
// ---------------------------------------------------------------------------

describe("ChatPanel — tool calls", () => {
  it("renders running tool card for active tool calls", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      activeToolCalls: [{ kitId: null, toolName: "bash" }],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("Terminal")).toBeTruthy();
  });

  it("renders known tool display names", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      activeToolCalls: [{ kitId: null, toolName: "file_edit" }],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("Edit File")).toBeTruthy();
  });

  it("renders unknown tool name as-is with fallback icon", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      activeToolCalls: [{ kitId: null, toolName: "custom_tool" }],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    // getToolMeta returns the toolName if unknown
    expect(screen.getByText("custom_tool")).toBeTruthy();
  });

  it("does not show tool calls section when none active", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      isStreaming: true,
      activeToolCalls: [],
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.queryByText("Terminal")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Model picker
// ---------------------------------------------------------------------------

describe("ChatPanel — model picker", () => {
  const TEST_MODELS = [
    {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
      providerId: "anthropic",
      providerName: "Anthropic",
    },
  ];

  it("renders model picker list when modelPickerOpen is true", async () => {
    // Pre-configure the mock so the models effect returns the same list,
    // preventing it from wiping the pre-set availableModels.
    const { getAvailableModels } = await import("../../lib/commands");
    vi.mocked(getAvailableModels).mockResolvedValueOnce([
      [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
      null,
    ]);

    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      modelPickerOpen: true,
      availableModels: TEST_MODELS,
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    const listbox = screen.getByRole("listbox", { name: "Models" });
    expect(listbox).toBeTruthy();
    // "Claude Sonnet 4" may appear in both the header hint and the list item.
    expect(screen.getAllByText("Claude Sonnet 4").length).toBeGreaterThan(0);
  });

  it("shows empty state when no models match query", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      modelPickerOpen: true,
      modelPickerQuery: "zzz",
      availableModels: TEST_MODELS,
    });
    act(() => {
      render(<ChatPanel />);
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });
    // Flush async effects triggered by connected=true (e.g. getAvailableModels).
    await flushEffects();

    expect(screen.getByText(/No models match/)).toBeTruthy();
  });

  it("marks default model with 'default' badge", async () => {
    const { getAvailableModels } = await import("../../lib/commands");
    vi.mocked(getAvailableModels).mockResolvedValueOnce([
      [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
      "anthropic/claude-sonnet-4",
    ]);

    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      modelPickerOpen: true,
      defaultModelId: "anthropic/claude-sonnet-4",
      availableModels: TEST_MODELS,
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("default")).toBeTruthy();
  });

  it("marks selected model with 'current' badge", async () => {
    const { getAvailableModels } = await import("../../lib/commands");
    vi.mocked(getAvailableModels).mockResolvedValueOnce([
      [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
      ],
      null,
    ]);

    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      modelPickerOpen: true,
      selectedModel: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4",
        displayName: "Claude Sonnet 4",
      },
      availableModels: TEST_MODELS,
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    expect(screen.getByText("current")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Slash menu
// ---------------------------------------------------------------------------

describe("ChatPanel — slash menu", () => {
  it("renders slash command list when slashMenuOpen is true", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      slashMenuOpen: true,
    });
    useSearchStore.setState({ query: "/" });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    const listbox = screen.getByRole("listbox", { name: "Commands" });
    expect(listbox).toBeTruthy();
    // The /models command should be listed
    expect(screen.getByText("Models")).toBeTruthy();
  });

  it("shows empty state when no slash commands match query", () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      slashMenuOpen: true,
    });
    useSearchStore.setState({ query: "/zzz" });
    act(() => {
      render(<ChatPanel />);
    });

    expect(screen.getByText(/No commands match/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suggestion buttons
// ---------------------------------------------------------------------------

describe("ChatPanel — suggestion buttons", () => {
  it("clicking a suggestion sets a user message in store", async () => {
    useChatStore.setState({
      statusChecked: true,
      chatStatus: { connected: true, sessionId: null, repoPath: "/brain" },
      messages: [],
      isStreaming: false,
    });
    act(() => {
      render(<ChatPanel />);
    });
    await flushEffects();

    await act(async () => {
      fireEvent.click(screen.getByText("What did I work on this week?"));
      await Promise.resolve();
    });

    const state = useChatStore.getState();
    expect(state.messages[0]).toEqual({
      role: "user",
      content: "What did I work on this week?",
    });
  });
});
