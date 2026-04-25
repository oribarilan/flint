// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { createRef } from "react";
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

function makeTriggerRef() {
  return createRef<HTMLButtonElement>();
}

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    // Arrow down moves to index 1
    fireEvent.keyDown(document, { key: "ArrowDown" });
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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

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
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    expect(listbox.getAttribute("aria-label")).toBe("Select model");
    expect(listbox.getAttribute("tabindex")).toBe("0");
    // Initial focus is on current model (gpt-4.1)
    expect(listbox.getAttribute("aria-activedescendant")).toBe("model-option-gpt-4.1");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[0].getAttribute("id")).toBe("model-option-gpt-4.1");
    expect(options[1].getAttribute("aria-selected")).toBe("false");
    expect(options[1].getAttribute("id")).toBe("model-option-claude-sonnet-4");
  });

  it("updates aria-activedescendant on arrow navigation", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    const listbox = screen.getByRole("listbox");
    expect(listbox.getAttribute("aria-activedescendant")).toBe("model-option-gpt-4.1");

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe("model-option-claude-sonnet-4");
  });

  it("traps Tab key inside popover", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [{ id: "gpt-4.1", name: "GPT 4.1" }],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    const prevented = !document.dispatchEvent(event);
    // Tab should be prevented (default prevented)
    expect(prevented).toBe(true);
  });

  it("shows error message when listModels rejects", async () => {
    mockListModels.mockRejectedValueOnce(new Error("Network error"));

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    // Should show loading initially
    expect(screen.getByText("Loading models…")).toBeTruthy();

    // Wait for the rejection to be handled
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Should show error message
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Couldn't load models")).toBeTruthy();

    // Should not show loading anymore
    expect(screen.queryByText("Loading models…")).toBeNull();
  });

  it("filters models by search query", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { id: "o3-mini", name: "o3-mini" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    const searchInput = screen.getByPlaceholderText("Search models…");
    expect(searchInput).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "claude" } });

    expect(screen.queryByText("GPT 4.1")).toBeNull();
    expect(screen.getByText("Claude Sonnet 4")).toBeTruthy();
    expect(screen.queryByText("o3-mini")).toBeNull();
  });

  it("shows 'No models match' when search has no results", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    const searchInput = screen.getByPlaceholderText("Search models…");
    fireEvent.change(searchInput, { target: { value: "xyz" } });

    expect(screen.getByText("No models match")).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("keyboard selects from filtered list", () => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [
        { id: "gpt-4.1", name: "GPT 4.1" },
        { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { id: "o3-mini", name: "o3-mini" },
      ],
    });

    const onClose = vi.fn();
    render(<ModelPicker onClose={onClose} triggerRef={makeTriggerRef()} />);

    const searchInput = screen.getByPlaceholderText("Search models…");
    fireEvent.change(searchInput, { target: { value: "o3" } });

    // Only o3-mini should be visible, arrow down + enter selects it
    fireEvent.keyDown(document, { key: "Enter" });

    expect(mockSetModel).toHaveBeenCalledWith("o3-mini");
    expect(onClose).toHaveBeenCalled();
  });
});
