import { describe, it, expect } from "vitest";
import { isMac } from "../../lib/platform";

describe("platform", () => {
  it("isMac returns a boolean", () => {
    expect(typeof isMac()).toBe("boolean");
  });

  it("isMac returns false in jsdom (non-Mac environment)", () => {
    expect(isMac()).toBe(false);
  });
});
