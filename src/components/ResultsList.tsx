import { useEffect, useRef } from "react";
import { useSearchStore } from "../stores/searchStore";
import { openFile, hideWindow } from "../lib/commands";
import { focusSearchBar } from "../lib/focus";
import { getKitComponents } from "../kits/registry";
import type { KitAction, KitSearchResult } from "../kits/types";
import styles from "./ResultsList.module.css";

/** Execute the default action for a result and dismiss the launcher. */
export function executeAction(action: KitAction): void {
  switch (action.type) {
    case "Open":
      openFile(action.target)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to open:", err);
        });
      break;
    case "Copy":
      navigator.clipboard
        .writeText(action.text)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to copy:", err);
        });
      break;
    case "ActivateKit":
      useSearchStore.getState().setQuery(action.prefix);
      focusSearchBar();
      break;
    default:
      // Other action types (FocusWindow, Paste, Custom, OpenApp)
      // will be implemented alongside the kits that use them.
      break;
  }
}

/** Execute the default (first) action for a result. */
export function executeDefaultAction(result: KitSearchResult): void {
  const action = result.actions[0];
  if (action) {
    executeAction(action);
  }
}

export default function ResultsList() {
  const containerRef = useRef<HTMLDivElement>(null);
  const results = useSearchStore((s) => s.results);
  const query = useSearchStore((s) => s.query);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const setSelectedIndex = useSearchStore((s) => s.setSelectedIndex);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  if (results.length === 0 && query.length === 0) {
    return null;
  }

  if (results.length === 0 && query.length > 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>No results found</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.container} role="listbox" aria-label="Search results">
      {results.map((result, index) => {
        const { SearchResult } = getKitComponents(result.kitId);
        return (
          <div
            key={`${result.kitId}:${result.id}`}
            className={index === selectedIndex ? styles.itemSelected : styles.item}
            role="option"
            aria-selected={index === selectedIndex}
            onMouseEnter={() => {
              setSelectedIndex(index);
            }}
            onClick={() => {
              executeDefaultAction(result);
            }}
          >
            <SearchResult result={result} isSelected={index === selectedIndex} index={index} />
          </div>
        );
      })}
    </div>
  );
}
