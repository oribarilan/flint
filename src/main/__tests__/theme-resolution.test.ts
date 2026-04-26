import { describe, it, expect, vi, beforeEach } from "vitest";

const mockShouldUseDarkColors = vi.fn<() => boolean>();

vi.mock("electron", () => ({
  nativeTheme: {
    get shouldUseDarkColors() {
      return mockShouldUseDarkColors();
    },
  },
}));

import { resolveTheme } from "../theme";

describe("resolveTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "dark" for dark preference', () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it('returns "light" for light preference', () => {
    expect(resolveTheme("light")).toBe("light");
  });

  it('returns "dark" for system preference when OS prefers dark', () => {
    mockShouldUseDarkColors.mockReturnValue(true);
    expect(resolveTheme("system")).toBe("dark");
  });

  it('returns "light" for system preference when OS prefers light', () => {
    mockShouldUseDarkColors.mockReturnValue(false);
    expect(resolveTheme("system")).toBe("light");
  });
});
