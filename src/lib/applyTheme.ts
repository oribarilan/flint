/** Apply the font-size preset by setting a data attribute on the root element. */
export function applyFontSize(size: string) {
  document.documentElement.dataset.fontSize = size;
}
