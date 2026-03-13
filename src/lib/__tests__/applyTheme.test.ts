import { describe, it, expect, afterEach } from "vitest";
import { applyFontSize, applyTheme } from "../applyTheme";

afterEach(() => {
  delete document.documentElement.dataset.fontSize;
  delete document.documentElement.dataset.theme;
});

describe("applyFontSize", () => {
  it("sets data-font-size attribute on html element", () => {
    applyFontSize("large");
    expect(document.documentElement.dataset.fontSize).toBe("large");
  });

  it("overrides previous font size", () => {
    applyFontSize("small");
    applyFontSize("medium");
    expect(document.documentElement.dataset.fontSize).toBe("medium");
  });
});

describe("applyTheme", () => {
  it("sets data-theme attribute on html element", () => {
    applyTheme("tokyonight");
    expect(document.documentElement.dataset.theme).toBe("tokyonight");
  });

  it("overrides previous theme", () => {
    applyTheme("flint");
    applyTheme("catppuccin");
    expect(document.documentElement.dataset.theme).toBe("catppuccin");
  });
});
