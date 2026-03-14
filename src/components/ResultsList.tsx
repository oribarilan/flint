import { useEffect, useRef } from "react";
import { useSearchStore } from "../stores/searchStore";
import { openFile, hideWindow, executeCommand } from "../lib/commands";
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
    case "ActivateCommand":
      useSearchStore.getState().activateCommand({
        kitId: action.kit_id,
        commandId: action.command_id,
        name: action.command_id,
      });
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
  if (!action) return;

  // Execute-mode commands: hide Flint first (restoring previous app focus),
  // then run the command. This ensures commands like window tiling target
  // the correct window.
  if (result.kind.type === "Command" && result.kind.mode === "Execute") {
    const { kit_id, command_id } = result.kind;
    hideWindow()
      .then(() => executeCommand(kit_id, command_id))
      .catch((err: unknown) => {
        console.error("Failed to execute command:", err);
      });
    return;
  }

  // For ActivateCommand, use the result title/icon for a better chip label.
  if (action.type === "ActivateCommand") {
    useSearchStore.getState().activateCommand({
      kitId: action.kit_id,
      commandId: action.command_id,
      name: result.title,
      icon: result.icon,
    });
    focusSearchBar();
    return;
  }

  executeAction(action);
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
        <div className={styles.emptyState}>
          <span>No matches for &ldquo;{query}&rdquo;</span>
          <span className={styles.emptyHint}>Try a shorter term or check indexed directories in Settings</span>
        </div>
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
