// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HotkeyHint, formatKey } from "../HotkeyHint";

afterEach(cleanup);

describe("formatKey", () => {
  it("converts modifier keys to symbols", () => {
    expect(formatKey("ctrl")).toBe("⌃");
    expect(formatKey("cmd")).toBe("⌘");
    expect(formatKey("meta")).toBe("⌘");
    expect(formatKey("shift")).toBe("⇧");
    expect(formatKey("alt")).toBe("⌥");
    expect(formatKey("option")).toBe("⌥");
  });

  it("converts special keys to symbols", () => {
    expect(formatKey("enter")).toBe("↵");
    expect(formatKey("space")).toBe("␣");
    expect(formatKey("escape")).toBe("esc");
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
    expect(formatKey("Ctrl")).toBe("⌃");
    expect(formatKey("CMD")).toBe("⌘");
    expect(formatKey("Escape")).toBe("esc");
  });
});

describe("HotkeyHint", () => {
  it("renders a single key as a kbd element", () => {
    render(<HotkeyHint keys={["j"]} />);
    const kbd = screen.getByText("J");
    expect(kbd.tagName).toBe("KBD");
  });

  it("renders modifier + key combo side by side", () => {
    render(<HotkeyHint keys={["cmd", "k"]} />);
    expect(screen.getByText("⌘")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
  });

  it("renders special keys with correct symbols", () => {
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
    expect(kbds[0].textContent).toBe("⌃");
    expect(kbds[1].textContent).toBe("⇧");
    expect(kbds[2].textContent).toBe("/");
  });
});
