import { describe, it, expect } from "vitest";
import { isMac, isWindows } from "../../lib/platform";

describe("platform", () => {
  it("isMac returns a boolean", () => {
    expect(typeof isMac()).toBe("boolean");
  });

  it("isMac returns false in jsdom (non-Mac environment)", () => {
    expect(isMac()).toBe(false);
  });

  it("isWindows returns a boolean", () => {
    expect(typeof isWindows()).toBe("boolean");
  });

  it("isWindows returns false in jsdom (non-Windows environment)", () => {
    expect(isWindows()).toBe(false);
  });
});
