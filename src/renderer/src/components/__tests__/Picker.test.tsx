// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Picker } from "../Picker";

afterEach(() => {
  cleanup();
});

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Charlie" },
];

describe("Picker", () => {
  it("renders items with correct ARIA attributes", () => {
    render(
      <Picker items={items} selectedId="a" onSelect={vi.fn()} label="Test list" />,
    );

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    expect(listbox.getAttribute("aria-label")).toBe("Test list");
    expect(listbox.getAttribute("tabindex")).toBe("0");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[1].getAttribute("aria-selected")).toBe("false");
    expect(options[2].getAttribute("aria-selected")).toBe("false");
  });

  it("uses custom idPrefix for option ids", () => {
    render(
      <Picker
        items={items}
        selectedId="a"
        onSelect={vi.fn()}
        label="Test"
        idPrefix="custom"
      />,
    );

    const options = screen.getAllByRole("option");
    expect(options[0].getAttribute("id")).toBe("custom-a");
    expect(options[1].getAttribute("id")).toBe("custom-b");
  });

  it("shows check icon on selected item only", () => {
    render(
      <Picker items={items} selectedId="b" onSelect={vi.fn()} label="Test" />,
    );

    const options = screen.getAllByRole("option");
    expect(options[0].querySelectorAll("svg").length).toBe(0);
    expect(options[1].querySelectorAll("svg").length).toBe(1);
    expect(options[2].querySelectorAll("svg").length).toBe(0);
  });

  it("arrow key navigation updates focus", () => {
    render(
      <Picker items={items} selectedId="a" onSelect={vi.fn()} label="Test" />,
    );

    const listbox = screen.getByRole("listbox");
    expect(listbox.getAttribute("aria-activedescendant")).toBe("picker-option-a");

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe("picker-option-b");

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe("picker-option-c");

    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(listbox.getAttribute("aria-activedescendant")).toBe("picker-option-b");
  });

  it("enter calls onSelect with focused item id", () => {
    const onSelect = vi.fn();
    render(
      <Picker items={items} selectedId="a" onSelect={onSelect} label="Test" />,
    );

    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("tab is trapped", () => {
    render(
      <Picker items={items} selectedId="a" onSelect={vi.fn()} label="Test" />,
    );

    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    const prevented = !document.dispatchEvent(event);
    expect(prevented).toBe(true);
  });

  it("click selects an item", () => {
    const onSelect = vi.fn();
    render(
      <Picker items={items} selectedId="a" onSelect={onSelect} label="Test" />,
    );

    fireEvent.click(screen.getByText("Charlie"));
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("mouse enter updates focus index", () => {
    render(
      <Picker items={items} selectedId="a" onSelect={vi.fn()} label="Test" />,
    );

    const listbox = screen.getByRole("listbox");
    fireEvent.mouseEnter(screen.getByText("Charlie").closest('[role="option"]')!);
    expect(listbox.getAttribute("aria-activedescendant")).toBe("picker-option-c");
  });

  it("arrow up does not go below 0", () => {
    const onSelect = vi.fn();
    render(
      <Picker items={items} selectedId="a" onSelect={onSelect} label="Test" />,
    );

    fireEvent.keyDown(document, { key: "ArrowUp" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("arrow down does not go past last item", () => {
    const onSelect = vi.fn();
    render(
      <Picker items={items} selectedId="c" onSelect={onSelect} label="Test" />,
    );

    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });
});
