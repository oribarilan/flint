/** Apply the font-size preset by setting a data attribute on the root element. */
export function applyFontSize(size: string) {
  document.documentElement.dataset.fontSize = size;
}

/** Resolve a theme value to its effective data-theme attribute. */
function resolveTheme(theme: string): string {
  if (theme === "system" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "flint" : "flint-light";
  }
  if (theme === "system") {
    return "flint";
  }
  return theme;
}

/** Apply a color theme by setting a data attribute on the root element. */
export function applyTheme(theme: string) {
  document.documentElement.dataset.theme = resolveTheme(theme);

  // Store the raw preference so the system listener knows whether to react.
  document.documentElement.dataset.themePreference = theme;
}

/** Apply backdrop blur setting by setting a data attribute on the root element. */
export function applyBackdropBlur(enabled: boolean) {
  document.documentElement.dataset.backdropBlur = enabled ? "true" : "false";
}

// Listen for OS color scheme changes and re-apply if preference is "system".
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (document.documentElement.dataset.themePreference === "system") {
      applyTheme("system");
    }
  });
}
