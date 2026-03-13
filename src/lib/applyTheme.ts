/** Apply the font-size preset by setting a data attribute on the root element. */
export function applyFontSize(size: string) {
  document.documentElement.dataset.fontSize = size;
}

/** Apply a color theme by setting a data attribute on the root element. */
export function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
}
