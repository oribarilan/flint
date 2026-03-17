import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import { useChatStore } from "../../stores/chatStore";
import SearchBar from "../SearchBar";

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
  });
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    currentResponse: "",
    chatStatus: { connected: false, sessionId: null, repoPath: null },
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
