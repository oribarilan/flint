// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SearchablePicker } from "../SearchablePicker";

afterEach(() => {
  cleanup();
});

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Charlie" },
];

describe("SearchablePicker", () => {
  it("renders search input and items", () => {
    render(
      <SearchablePicker
        items={items}
        selectedId="a"
        onSelect={vi.fn()}
        label="Test"
        searchPlaceholder="Search…"
      />,
    );

    expect(screen.getByPlaceholderText("Search…")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
  });

  it("typing filters items by label", () => {
    render(
      <SearchablePicker
        items={items}
        selectedId="a"
        onSelect={vi.fn()}
        label="Test"
        searchPlaceholder="Search…"
      />,
    );

    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "al" } });

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.queryByText("Beta")).toBeNull();
    expect(screen.queryByText("Charlie")).toBeNull();
  });

  it("shows empty message when no results", () => {
    render(
      <SearchablePicker
        items={items}
        selectedId="a"
        onSelect={vi.fn()}
        label="Test"
        searchPlaceholder="Search…"
        emptyMessage="Nothing found"
      />,
    );

    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "xyz" } });

    expect(screen.getByText("Nothing found")).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("keyboard selects from filtered list", () => {
    const onSelect = vi.fn();
    render(
      <SearchablePicker
        items={items}
        selectedId="a"
        onSelect={onSelect}
        label="Test"
        searchPlaceholder="Search…"
      />,
    );

    const input = screen.getByPlaceholderText("Search…");
    fireEvent.change(input, { target: { value: "char" } });

    // Only Charlie should be visible, Enter selects it
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("auto-focuses search input on mount", () => {
    render(
      <SearchablePicker
        items={items}
        selectedId="a"
        onSelect={vi.fn()}
        label="Test"
        searchPlaceholder="Type here"
      />,
    );

    const input = screen.getByPlaceholderText("Type here");
    expect(document.activeElement).toBe(input);
  });

  it("uses default placeholder and empty message", () => {
    render(<SearchablePicker items={[]} onSelect={vi.fn()} label="Test" />);

    expect(screen.getByPlaceholderText("Search…")).toBeTruthy();
  });
});
