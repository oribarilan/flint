/** Move focus to the main search input. */
export function focusSearchBar(): void {
  const input = document.querySelector<HTMLInputElement>("input[aria-label='Search']");
  input?.focus();
}

// ---------------------------------------------------------------------------
// Blur-hide suppression
// ---------------------------------------------------------------------------

let blurHideSuppressedUntil = 0;

/**
 * Suppress blur→hide for a short window. Call synchronously before any
 * action that opens a sibling window (e.g., settings) so the main window
 * doesn't auto-hide when it loses focus.
 */
export function suppressNextBlurHide(): void {
  blurHideSuppressedUntil = Date.now() + 500;
}

/** Returns `true` if the blur→hide should proceed (normal case). */
export function shouldHideOnBlur(): boolean {
  return Date.now() > blurHideSuppressedUntil;
}
