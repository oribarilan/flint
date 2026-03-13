/** Move focus to the main search input. */
export function focusSearchBar(): void {
  const input = document.querySelector<HTMLInputElement>("input[aria-label='Search']");
  input?.focus();
}
