import { useEffect } from "react";

interface FlintDebug {
  isLastActionVisible: () => boolean | null;
}

declare global {
  interface Window {
    __flintDebug?: FlintDebug;
  }
}

/**
 * Checks whether the last action item in the ActionPanel is fully visible
 * within its scrollable container (not clipped by the HintBar or overflow).
 *
 * Returns `true` if fully visible, `false` if clipped, `null` if no action
 * panel is open.
 */
function isLastActionVisible(): boolean | null {
  const allActions = document.querySelectorAll<HTMLElement>("[data-action-type]");
  if (allActions.length === 0) return null;

  const lastAction = allActions[allActions.length - 1];
  if (!lastAction) return null;

  const scrollContainer = lastAction.closest<HTMLElement>("[role='listbox']");
  if (!scrollContainer) return null;

  const containerRect = scrollContainer.getBoundingClientRect();
  const itemRect = lastAction.getBoundingClientRect();

  // Item is fully visible if its bottom edge is within (or at) the
  // container's bottom edge (with 1px tolerance for sub-pixel rounding).
  return itemRect.bottom <= containerRect.bottom + 1;
}

/** Exposes `window.__flintDebug.isLastActionVisible()` in dev mode. */
export function useActionPanelDebug(): void {
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__flintDebug = { isLastActionVisible };
    }
    return () => {
      if (import.meta.env.DEV) {
        delete window.__flintDebug;
      }
    };
  }, []);
}
