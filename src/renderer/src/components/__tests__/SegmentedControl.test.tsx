// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent, screen } from "@testing-library/react";
import { SegmentedControl } from "../SegmentedControl";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { label: "A", value: "a" },
  { label: "B", value: "b" },
  { label: "C", value: "c" },
];

describe("SegmentedControl", () => {
  it("renders all options as radio buttons", () => {
    render(
      <SegmentedControl options={OPTIONS} value="a" onChange={vi.fn()} ariaLabel="Test" />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("marks active option with aria-checked", () => {
    render(
      <SegmentedControl options={OPTIONS} value="b" onChange={vi.fn()} ariaLabel="Test" />,
    );

    expect(screen.getByRole("radio", { name: "B" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "A" }).getAttribute("aria-checked")).toBe("false");
  });

  it("calls onChange with the selected value", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={OPTIONS} value="a" onChange={onChange} ariaLabel="Test" />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "C" }));

    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("disables options when disabled flag is set", () => {
    const options = [
      { label: "On", value: "on" },
      { label: "Off", value: "off", disabled: true, disabledLabel: "Soon" },
    ];
    render(
      <SegmentedControl options={options} value="on" onChange={vi.fn()} ariaLabel="Test" />,
    );

    const offBtn = screen.getByRole("radio", { name: /Off/ });
    expect(offBtn.getAttribute("aria-disabled")).toBe("true");
    expect((offBtn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Soon")).toBeTruthy();
  });

  it("renders with radiogroup role and aria-label", () => {
    render(
      <SegmentedControl options={OPTIONS} value="a" onChange={vi.fn()} ariaLabel="My control" />,
    );

    expect(screen.getByRole("radiogroup", { name: "My control" })).toBeTruthy();
  });
});
