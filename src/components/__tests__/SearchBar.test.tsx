import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import { useChatStore, filterAndSortModels } from "../../stores/chatStore";
import SearchBar from "../SearchBar";

vi.mock("../../lib/commands", async () => {
  const actual = await vi.importActual("../../lib/commands");
  return {
    ...actual,
    setProjectDefaultModel: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("../../lib/platform", () => ({
  isMac: vi.fn(() => false),
}));

beforeEach(() => {
  useSearchStore.setState({
    mode: "search",
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
    activeCommand: null,
    actionPanelOpen: false,
    actionPanelResult: null,
    actionFilterQuery: "",
    selectedActionIndex: 0,
    armedActionIndex: null,
  });
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    currentResponse: "",
    activeToolCalls: [],
    chatStatus: { connected: false, sessionId: null, repoPath: null },
    statusChecked: false,
    selectedModel: null,
    modelPickerOpen: false,
    modelPickerMode: "session",
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
  });
});

describe("SearchBar", () => {
  it("renders search icon in default mode", () => {
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // Magnifying glass path contains the circle arc substring
    const path = svg?.querySelector("path");
    expect(path?.getAttribute("d")).toContain("3.5a5.5");
  });

  it("renders sparkle icon in agent mode", () => {
    useSearchStore.setState({ mode: "agent" });
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // Sparkle path does not use fillRule
    const path = svg?.querySelector("path");
    expect(path?.getAttribute("fillRule")).toBeNull();
    // Verify it's actually the sparkle path (starts with "M10 1")
    expect(path?.getAttribute("d")).toContain("M10 1");
  });

  it("Enter in agent mode calls onSendChat", () => {
    useSearchStore.setState({ mode: "agent" });
    const onSendChat = vi.fn();
    render(<SearchBar onArrowDown={vi.fn()} onSendChat={onSendChat} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSendChat).toHaveBeenCalledTimes(1);
  });

  it("Enter in search mode does not call onSendChat", () => {
    const onSendChat = vi.fn();
    render(<SearchBar onArrowDown={vi.fn()} onSendChat={onSendChat} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSendChat).not.toHaveBeenCalled();
  });

  it("Enter in slash menu triggers models picker", () => {
    useSearchStore.setState({ mode: "agent", query: "/m" });
    useChatStore.setState({ slashMenuOpen: true, slashMenuIndex: 0, modelPickerOpen: false });

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useChatStore.getState().modelPickerOpen).toBe(true);
    expect(useSearchStore.getState().query).toBe("");
  });

  it("Escape closes slash menu and keeps slash text", () => {
    useSearchStore.setState({ mode: "agent", query: "/" });
    useChatStore.setState({ slashMenuOpen: true, slashMenuDismissed: false });

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(useChatStore.getState().slashMenuOpen).toBe(false);
    expect(useSearchStore.getState().query).toBe("/");
    expect(useChatStore.getState().slashMenuDismissed).toBe(true);
  });

  it("ArrowDown in model picker follows default-first ordering", () => {
    useSearchStore.setState({ mode: "agent", query: "" });
    useChatStore.setState({
      modelPickerOpen: true,
      modelPickerIndex: 0,
      modelPickerQuery: "",
      defaultModelId: "openai/gpt-4o",
      availableModels: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          providerId: "anthropic",
          providerName: "Anthropic",
        },
        { id: "openai/gpt-4o", name: "GPT-4o", providerId: "openai", providerName: "OpenAI" },
        {
          id: "google/gemini-2.0",
          name: "Gemini 2.0",
          providerId: "google",
          providerName: "Google",
        },
      ],
    });

    const ordered = filterAndSortModels(
      useChatStore.getState().availableModels,
      "",
      useChatStore.getState().defaultModelId,
    );
    expect(ordered[0]?.id).toBe("openai/gpt-4o");

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);
    const input = screen.getByRole("textbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    const selected = useChatStore.getState().selectedModel;
    expect(selected?.providerId).toBe("anthropic");
    expect(selected?.displayName).toBe("Claude Sonnet 4");
  });

  it("Escape does not close model picker when default is required", () => {
    useSearchStore.setState({ mode: "agent", query: "" });
    useChatStore.setState({
      modelPickerOpen: true,
      modelPickerMode: "default_required",
      modelPickerQuery: "",
      modelPickerIndex: 0,
      availableModels: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          providerId: "anthropic",
          providerName: "Anthropic",
        },
      ],
    });

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(useChatStore.getState().modelPickerOpen).toBe(true);
  });

  it("Enter in required mode persists default before closing picker", async () => {
    const { setProjectDefaultModel } = await import("../../lib/commands");
    const mockedSetProjectDefaultModel = vi.mocked(setProjectDefaultModel);
    mockedSetProjectDefaultModel.mockResolvedValue(undefined);

    useSearchStore.setState({ mode: "agent", query: "" });
    useChatStore.setState({
      modelPickerOpen: true,
      modelPickerMode: "default_required",
      modelPickerQuery: "",
      modelPickerIndex: 0,
      defaultModelId: null,
      selectedModel: null,
      availableModels: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          providerId: "anthropic",
          providerName: "Anthropic",
        },
      ],
    });

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);
    const input = screen.getByRole("textbox");

    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(mockedSetProjectDefaultModel).toHaveBeenCalledWith("anthropic/claude-sonnet-4");

    expect(useChatStore.getState().defaultModelId).toBe("anthropic/claude-sonnet-4");
    expect(useChatStore.getState().hasProjectDefaultModel).toBe(true);
    expect(useChatStore.getState().selectedModel?.displayName).toBe("Claude Sonnet 4");
    expect(useChatStore.getState().modelPickerOpen).toBe(false);
  });

  it("Shift+Enter in model picker opens model action panel", () => {
    useSearchStore.setState({ mode: "agent", query: "" });
    useChatStore.setState({
      modelPickerOpen: true,
      modelPickerMode: "session",
      modelPickerActionPanelOpen: false,
      availableModels: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          providerId: "anthropic",
          providerName: "Anthropic",
        },
      ],
    });

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(useChatStore.getState().modelPickerActionPanelOpen).toBe(true);
  });

  it("Escape closes model action panel but keeps model picker open", () => {
    useSearchStore.setState({ mode: "agent", query: "" });
    useChatStore.setState({
      modelPickerOpen: true,
      modelPickerMode: "session",
      modelPickerActionPanelOpen: true,
      availableModels: [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          providerId: "anthropic",
          providerName: "Anthropic",
        },
      ],
    });

    render(<SearchBar onArrowDown={vi.fn()} onSendChat={vi.fn()} />);
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(useChatStore.getState().modelPickerActionPanelOpen).toBe(false);
    expect(useChatStore.getState().modelPickerOpen).toBe(true);
  });

  it("ArrowDown calls onArrowDown in search mode", () => {
    const onArrowDown = vi.fn();
    render(<SearchBar onArrowDown={onArrowDown} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(onArrowDown).toHaveBeenCalledTimes(1);
  });

  it("Enter in search mode calls onSubmitSearch", () => {
    const onSubmitSearch = vi.fn();
    render(<SearchBar onArrowDown={vi.fn()} onSubmitSearch={onSubmitSearch} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmitSearch).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp calls onArrowUp in search mode", () => {
    const onArrowUp = vi.fn();
    render(<SearchBar onArrowDown={vi.fn()} onArrowUp={onArrowUp} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(onArrowUp).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp does not call onArrowUp in agent mode", () => {
    useSearchStore.setState({ mode: "agent" });
    const onArrowUp = vi.fn();
    render(<SearchBar onArrowDown={vi.fn()} onArrowUp={onArrowUp} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(onArrowUp).not.toHaveBeenCalled();
  });

  it("shows search placeholder in search mode", () => {
    render(<SearchBar onArrowDown={vi.fn()} />);

    expect(screen.getByPlaceholderText("Search files...")).toBeTruthy();
  });

  it("shows agent placeholder in agent mode", () => {
    useSearchStore.setState({ mode: "agent" });
    render(<SearchBar onArrowDown={vi.fn()} />);

    expect(screen.getByPlaceholderText("Ask anything...")).toBeTruthy();
  });

  it("shows Tab keybinding hint when not loading", () => {
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const kbd = container.querySelector("kbd");
    expect(kbd).toBeTruthy();
    expect(kbd?.textContent).toBe("Tab");
  });

  it("hides Tab hint when loading in search mode", () => {
    useSearchStore.setState({ isLoading: true });
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const kbd = container.querySelector("kbd");
    expect(kbd).toBeNull();
  });

  it("hides Tab hint when streaming in agent mode", () => {
    useSearchStore.setState({ mode: "agent" });
    useChatStore.setState({ isStreaming: true });
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const kbd = container.querySelector("kbd");
    expect(kbd).toBeNull();
  });

  it("renders chip when activeCommand is set", () => {
    useSearchStore.setState({
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
    });
    render(<SearchBar onArrowDown={vi.fn()} />);

    const chip = screen.getByTestId("command-chip");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("Calculator");
  });

  it("shows command-specific placeholder when chip is active", () => {
    useSearchStore.setState({
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
    });
    render(<SearchBar onArrowDown={vi.fn()} />);

    expect(screen.getByPlaceholderText("Search Calculator...")).toBeTruthy();
  });

  it("hides search icon when chip is active", () => {
    useSearchStore.setState({
      activeCommand: { kitId: "calc", commandId: "calculate", name: "Calculator" },
    });
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const svg = container.querySelector("svg");
    expect(svg).toBeNull();
  });

  // ── Action Panel ────────────────────────────────────────────

  it("Shift+Enter opens Action Panel", () => {
    useSearchStore.setState({
      results: [
        {
          kitId: "core",
          id: "/tmp/test.ts",
          title: "test.ts",
          kind: { type: "File" },
          actions: [{ type: "Open", target: "/tmp/test.ts" }],
        },
      ],
      selectedIndex: 0,
      mode: "search",
    });
    render(<SearchBar onArrowDown={vi.fn()} onSubmitSearch={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(useSearchStore.getState().actionPanelOpen).toBe(true);
  });

  it("shows kind chip when Action Panel is open", () => {
    useSearchStore.setState({
      actionPanelOpen: true,
      actionPanelResult: {
        kitId: "core",
        id: "/tmp/test.ts",
        title: "test.ts",
        kind: { type: "File" },
        actions: [{ type: "Open", target: "/tmp/test.ts" }],
      },
      actionFilterQuery: "",
    });
    render(<SearchBar onArrowDown={vi.fn()} />);

    const chip = screen.getByTestId("actions-chip");
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("File");
  });

  it("shows result info instead of input when Action Panel is open", () => {
    useSearchStore.setState({
      actionPanelOpen: true,
      actionPanelResult: {
        kitId: "core",
        id: "/tmp/test.ts",
        title: "test.ts",
        subtitle: "/tmp",
        kind: { type: "File" },
        actions: [{ type: "Open", target: "/tmp/test.ts" }],
      },
      actionFilterQuery: "",
    });
    render(<SearchBar onArrowDown={vi.fn()} />);

    expect(screen.getByText("test.ts")).toBeTruthy();
    expect(screen.getByText("/tmp")).toBeTruthy();
  });
});
