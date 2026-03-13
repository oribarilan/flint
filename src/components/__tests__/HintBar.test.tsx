import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
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
});

describe("HintBar", () => {
  it("shows search mode hints by default", () => {
    render(<HintBar />);

    expect(screen.getAllByText("Navigate")).toHaveLength(2);
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("Chat")).toBeTruthy();
    expect(screen.getByText("Dismiss")).toBeTruthy();
  });

  it("shows ↑↓ and ⌃J/K navigate hints in search mode", () => {
    render(<HintBar />);

    expect(screen.getByText("↑↓")).toBeTruthy();
    expect(screen.getByText("⌃J/K")).toBeTruthy();
  });

  it("shows chat mode hints when in chat mode", () => {
    useSearchStore.setState({ mode: "chat" });
    render(<HintBar />);

    expect(screen.getByText("Send")).toBeTruthy();
    expect(screen.getByText("Newline")).toBeTruthy();
    expect(screen.getByText("Search")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
  });

  it("does not show search hints in chat mode", () => {
    useSearchStore.setState({ mode: "chat" });
    render(<HintBar />);

    expect(screen.queryByText("Navigate")).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
  });

  it("renders kbd elements for each hint", () => {
    const { container } = render(<HintBar />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds.length).toBeGreaterThanOrEqual(5);
  });
});
