import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import { useChatStore } from "../../stores/chatStore";
import SearchBar from "../SearchBar";

beforeEach(() => {
  useSearchStore.setState({
    mode: "search",
    query: "",
    results: [],
    selectedIndex: 0,
    isLoading: false,
  });
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    isAuthenticating: false,
    currentResponse: "",
    authStatus: { authenticated: false, username: null },
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

  it("renders sparkle icon in chat mode", () => {
    useSearchStore.setState({ mode: "chat" });
    const { container } = render(<SearchBar onArrowDown={vi.fn()} />);

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // Sparkle path does not use fillRule
    const path = svg?.querySelector("path");
    expect(path?.getAttribute("fillRule")).toBeNull();
    // Verify it's actually the sparkle path (starts with "M10 1")
    expect(path?.getAttribute("d")).toContain("M10 1");
  });

  it("Enter in chat mode calls onSendChat", () => {
    useSearchStore.setState({ mode: "chat" });
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

  it("shows search placeholder in search mode", () => {
    render(<SearchBar onArrowDown={vi.fn()} />);

    expect(screen.getByPlaceholderText("Search files...")).toBeTruthy();
  });

  it("shows chat placeholder in chat mode", () => {
    useSearchStore.setState({ mode: "chat" });
    render(<SearchBar onArrowDown={vi.fn()} />);

    expect(screen.getByPlaceholderText("Ask anything...")).toBeTruthy();
  });
});
