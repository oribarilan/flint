import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { focusSearchBar, suppressNextBlurHide, shouldHideOnBlur } from "../focus";

describe("focusSearchBar", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the search input when present", () => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Search");
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, "focus");

    focusSearchBar();

    expect(focusSpy).toHaveBeenCalledOnce();
  });

  it("does nothing when search input is absent", () => {
    // Should not throw
    focusSearchBar();
  });
});

describe("blur-hide suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shouldHideOnBlur returns true by default", () => {
    vi.setSystemTime(Date.now() + 10_000); // well past any previous suppress
    expect(shouldHideOnBlur()).toBe(true);
  });

  it("suppressNextBlurHide prevents hide within the time window", () => {
    suppressNextBlurHide();
    expect(shouldHideOnBlur()).toBe(false);
  });

  it("shouldHideOnBlur returns true after suppress window expires", () => {
    suppressNextBlurHide();

    vi.advanceTimersByTime(600);

    expect(shouldHideOnBlur()).toBe(true);
  });

  it("suppress can be called multiple times", () => {
    suppressNextBlurHide();
    vi.advanceTimersByTime(300);

    // Re-suppress extends the window
    suppressNextBlurHide();

    vi.advanceTimersByTime(300);
    // Only 300ms since last suppress — still within window
    expect(shouldHideOnBlur()).toBe(false);

    vi.advanceTimersByTime(300);
    // 600ms since last suppress — expired
    expect(shouldHideOnBlur()).toBe(true);
  });
});
