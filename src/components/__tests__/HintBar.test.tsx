import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import { useChatStore } from "../../stores/chatStore";
import HintBar from "../HintBar";

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
  });
  useChatStore.setState({
    modelPickerOpen: false,
    modelPickerMode: "session",
    modelPickerActionPanelOpen: false,
    slashMenuOpen: false,
  });
});

describe("HintBar", () => {
  it("shows search mode hints by default", () => {
    render(<HintBar />);

    expect(screen.getAllByText("Navigate")).toHaveLength(2);
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("Agent")).toBeTruthy();
    expect(screen.getByText("Dismiss")).toBeTruthy();
  });

  it("shows ↑↓ and ⌃J/K navigate hints in search mode", () => {
    render(<HintBar />);

    expect(screen.getByText("↑↓")).toBeTruthy();
    expect(screen.getByText("⌃J/K")).toBeTruthy();
  });

  it("shows agent mode hints when in agent mode", () => {
    useSearchStore.setState({ mode: "agent" });
    render(<HintBar />);

    expect(screen.getByText("Send")).toBeTruthy();
    expect(screen.getByText("Newline")).toBeTruthy();
    expect(screen.getByText("Commands")).toBeTruthy();
    expect(screen.getByText("/")).toBeTruthy();
    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
  });

  it("does not show search hints in agent mode", () => {
    useSearchStore.setState({ mode: "agent" });
    render(<HintBar />);

    expect(screen.queryByText("Navigate")).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("renders kbd elements for each hint", () => {
    const { container } = render(<HintBar />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds.length).toBeGreaterThanOrEqual(5);
  });

  // ── Action Panel hints ──────────────────────────────────────

  it("shows Action Panel hints when panel is open", () => {
    useSearchStore.setState({ actionPanelOpen: true, armedActionIndex: null });
    render(<HintBar />);

    expect(screen.getByText("Run action")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
    expect(screen.queryByText("Agent")).toBeNull();
  });

  it("shows armed confirmation hints when action is armed", () => {
    useSearchStore.setState({ actionPanelOpen: true, armedActionIndex: 3 });
    render(<HintBar />);

    expect(screen.getByText("Confirm delete")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.queryByText("Run action")).toBeNull();
  });

  it("shows search hints with Actions when panel is closed", () => {
    useSearchStore.setState({ actionPanelOpen: false });
    render(<HintBar />);

    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
  });

  it("shows slash menu hints when slash menu is open", () => {
    useSearchStore.setState({ mode: "agent" });
    useChatStore.setState({ slashMenuOpen: true });

    render(<HintBar />);

    expect(screen.getByText("Select")).toBeTruthy();
    expect(screen.getByText("Dismiss")).toBeTruthy();
    expect(screen.getByText("↑↓")).toBeTruthy();
  });

  it("shows required model picker hints when default model is required", () => {
    useSearchStore.setState({ mode: "agent" });
    useChatStore.setState({ modelPickerOpen: true, modelPickerMode: "default_required" });

    render(<HintBar />);

    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByText("Set default")).toBeTruthy();
  });

  it("shows model picker action hints when action panel is open", () => {
    useSearchStore.setState({ mode: "agent" });
    useChatStore.setState({ modelPickerOpen: true, modelPickerActionPanelOpen: true });

    render(<HintBar />);

    expect(screen.getByText("Select")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
  });
});
