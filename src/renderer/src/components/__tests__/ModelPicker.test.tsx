// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { useModelStore } from "../../stores/modelStore";

// Mock window.flint
const mockListModels = vi.fn(() =>
  Promise.resolve([
    { id: "gpt-4.1", name: "GPT 4.1" },
    { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "o3-mini", name: "o3-mini" },
  ]),
);
const mockSetModel = vi.fn();

Object.defineProperty(window, "flint", {
  value: {
    platform: "darwin",
    listModels: mockListModels,
    setModel: mockSetModel,
  },
  writable: true,
});

import { ModelPicker } from "../ModelPicker";

beforeEach(() => {
  useModelStore.setState({
    currentModel: "gpt-4.1",
    models: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ModelPicker", () => {
  it("fetches and renders model list", async () => {
    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    // Should show loading initially
    expect(screen.getByText("Loading models…")).toBeTruthy();

    // Wait for models to load
    await act(async () => {
      // Let the promise from the component's useEffect resolve
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText("GPT 4.1")).toBeTruthy();
    expect(screen.getByText("Claude Sonnet 4")).toBeTruthy();
    expect(screen.getByText("o3-mini")).toBeTruthy();
    expect(mockListModels).toHaveBeenCalledTimes(1);
  });

  it("uses cached models on subsequent opens", async () => {
    // Pre-populate store with models
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    // Should NOT call listModels since models are cached
    expect(mockListModels).not.toHaveBeenCalled();
    expect(screen.getByText("GPT 4.1")).toBeTruthy();
    expect(screen.getByText("Claude Sonnet 4")).toBeTruthy();
  });

  it("shows check icon on current model only", async () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    const options = screen.getAllByRole("option");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[1].getAttribute("aria-selected")).toBe("false");

    // Check icon should be present only in the first option
    const svgs = options[0].querySelectorAll("svg");
    expect(svgs.length).toBe(1);

    const svgs2 = options[1].querySelectorAll("svg");
    expect(svgs2.length).toBe(0);
  });

  it("navigates with arrow keys", async () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { id: "o3-mini", name: "o3-mini" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    // Initial focus index should be on current model (index 0)
    const options = screen.getAllByRole("option");

    // Arrow down moves to index 1
    fireEvent.keyDown(document, { key: "ArrowDown" });
    // The focused class should be on the second option
    // We verify by pressing Enter and checking which model is selected
    fireEvent.keyDown(document, { key: "Enter" });

    expect(mockSetModel).toHaveBeenCalledWith("claude-sonnet-4");
  });

  it("arrow up does not go below 0", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    // Focus starts on index 0, arrow up should stay on 0
    fireEvent.keyDown(document, { key: "ArrowUp" });
    fireEvent.keyDown(document, { key: "Enter" });

    expect(mockSetModel).toHaveBeenCalledWith("gpt-4.1");
  });

  it("arrow down does not go past last item", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    // Arrow down twice from index 0 — should stop at index 1
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });

    expect(mockSetModel).toHaveBeenCalledWith("claude-sonnet-4");
  });

  it("selects model on Enter and closes picker", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    // Move to second option and select
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });

    expect(mockSetModel).toHaveBeenCalledWith("claude-sonnet-4");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects model on click and closes picker", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    fireEvent.click(screen.getByText("Claude Sonnet 4"));

    expect(mockSetModel).toHaveBeenCalledWith("claude-sonnet-4");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has correct ARIA attributes", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    expect(listbox.getAttribute("aria-label")).toBe("Select model");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[1].getAttribute("aria-selected")).toBe("false");
  });

  it("traps Tab key inside popover", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [{ id: "gpt-4.1", name: "GPT 4.1" }],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} />);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    const prevented = !document.dispatchEvent(event);
    // Tab should be prevented (default prevented)
    expect(prevented).toBe(true);
  });
});
