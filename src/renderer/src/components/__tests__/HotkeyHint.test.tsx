// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HotkeyHint, HotkeyGroup, formatKey } from "../HotkeyHint";

afterEach(cleanup);

describe("formatKey", () => {
  it("converts modifier keys to symbol labels", () => {
    expect(formatKey("ctrl")).toBe("Ctrl");
    expect(formatKey("cmd")).toBe("Cmd");
    expect(formatKey("meta")).toBe("Cmd");
    expect(formatKey("shift")).toBe("Shift");
    expect(formatKey("alt")).toBe("Alt");
    expect(formatKey("option")).toBe("Opt");
  });

  it("converts special keys to labels", () => {
    expect(formatKey("enter")).toBe("↵");
    expect(formatKey("space")).toBe("Space");
    expect(formatKey("escape")).toBe("Esc");
  });

  it("uppercases regular letter keys", () => {
    expect(formatKey("j")).toBe("J");
    expect(formatKey("a")).toBe("A");
  });

  it("preserves symbol keys", () => {
    expect(formatKey("/")).toBe("/");
    expect(formatKey("?")).toBe("?");
  });

  it("is case-insensitive for modifier and special keys", () => {
    expect(formatKey("Ctrl")).toBe("Ctrl");
    expect(formatKey("CMD")).toBe("Cmd");
    expect(formatKey("Escape")).toBe("Esc");
  });
});

describe("HotkeyHint", () => {
  it("renders a single key as a kbd element", () => {
    render(<HotkeyHint keys={["j"]} />);
    const kbd = screen.getByText("J");
    expect(kbd.tagName).toBe("KBD");
  });

  it("renders modifier + key combo with both as kbd elements", () => {
    render(<HotkeyHint keys={["cmd", "k"]} />);
    expect(screen.getByText("Cmd").tagName).toBe("KBD");
    expect(screen.getByText("K").tagName).toBe("KBD");
  });

  it("renders special keys with correct labels", () => {
    render(<HotkeyHint keys={["enter"]} />);
    expect(screen.getByText("↵")).toBeTruthy();
  });

  it("sets aria-hidden on the container", () => {
    const { container } = render(<HotkeyHint keys={["j"]} />);
    const span = container.firstElementChild;
    expect(span?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies custom className alongside default styles", () => {
    const { container } = render(<HotkeyHint keys={["j"]} className="my-custom" />);
    const span = container.firstElementChild;
    expect(span?.className).toContain("my-custom");
  });

  it("renders multiple keys as separate kbd elements", () => {
    const { container } = render(<HotkeyHint keys={["ctrl", "shift", "/"]} />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds).toHaveLength(3);
    expect(kbds[0].textContent).toBe("Ctrl");
    expect(kbds[1].textContent).toBe("Shift");
    expect(kbds[2].textContent).toBe("/");
  });

  it("applies modifier style to modifier keys and key style to regular keys", () => {
    const { container } = render(<HotkeyHint keys={["ctrl", "j"]} />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds[0].className).toContain("modifier");
    expect(kbds[1].className).toContain("key");
  });

  it("renders + separator between keys but not before the first", () => {
    const { container } = render(<HotkeyHint keys={["ctrl", "j"]} />);
    const separators = container.querySelectorAll("[class*='separator']");
    expect(separators).toHaveLength(1);
    expect(separators[0].textContent).toBe("+");
  });

  it("does not render separator for a single key", () => {
    const { container } = render(<HotkeyHint keys={["/"]} />);
    const separators = container.querySelectorAll("[class*='separator']");
    expect(separators).toHaveLength(0);
  });
});

describe("HotkeyGroup", () => {
  it("renders modifier + alternative keys with / separators", () => {
    const { container } = render(<HotkeyGroup modifier="ctrl" keys={["h", "j", "k", "l"]} />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds).toHaveLength(5);
    expect(kbds[0].textContent).toBe("Ctrl");
    expect(kbds[1].textContent).toBe("H");
    expect(kbds[2].textContent).toBe("J");
    expect(kbds[3].textContent).toBe("K");
    expect(kbds[4].textContent).toBe("L");
  });

  it("renders + between modifier and keys, / between alternative keys", () => {
    const { container } = render(<HotkeyGroup modifier="ctrl" keys={["u", "d"]} />);
    const plusSeps = container.querySelectorAll("[class*='separator']");
    const slashSeps = container.querySelectorAll("[class*='altSeparator']");
    expect(plusSeps.length).toBeGreaterThanOrEqual(1);
    expect(slashSeps).toHaveLength(1);
    expect(slashSeps[0].textContent).toBe("/");
  });

  it("sets aria-hidden on the container", () => {
    const { container } = render(<HotkeyGroup modifier="ctrl" keys={["j"]} />);
    const span = container.firstElementChild;
    expect(span?.getAttribute("aria-hidden")).toBe("true");
  });
});
