import { useEffect, useLayoutEffect, useRef } from "react";
import { useSearchStore } from "../stores/searchStore";
import {
  openFile,
  hideWindow,
  executeCommand,
  revealInFileManager,
  deleteToTrash,
  openInEditor,
  handleCustomAction,
} from "../lib/commands";
import { focusSearchBar } from "../lib/focus";
import { getKitComponents } from "../kits/registry";
import type { KitAction, KitSearchResult } from "../kits/types";
import styles from "./ResultsList.module.css";

/** Execute an action. Hides the window for most actions. */
export function executeAction(action: KitAction, kitId?: string): void {
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
        .then(() => {
          useSearchStore.getState().deactivateCommand();
          return hideWindow();
        })
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
    case "RevealInFileManager":
      revealInFileManager(action.target)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to reveal:", err);
        });
      break;
    case "CopyPath":
      navigator.clipboard
        .writeText(action.path)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to copy path:", err);
        });
      break;
    case "CopyName":
      navigator.clipboard
        .writeText(action.name)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to copy name:", err);
        });
      break;
    case "Delete":
      deleteToTrash(action.target)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to delete:", err);
        });
      break;
    case "OpenInEditor":
      openInEditor(action.target)
        .then(() => hideWindow())
        .catch((err: unknown) => {
          console.error("Failed to open in editor:", err);
        });
      break;
    case "Custom":
      if (kitId) {
        handleCustomAction(kitId, action.id)
          .then(() => {
            // Re-trigger search to refresh results after mutation.
            useSearchStore.getState().refreshSearch();
          })
          .catch((err: unknown) => {
            console.error("Failed to handle custom action:", err);
          });
      }
      break;
    default:
      // Other action types (FocusWindow, Paste, OpenApp, OpenInTerminal)
      // will be implemented alongside the kits that use them.
      break;
  }
}

/**
 * Execute an action from the Action Panel.
 *
 * Hides Flint **before** running the action so the OS returns focus to the
 * previous app. The spawned process (Finder, editor, terminal) then takes
 * focus naturally. This matches the Execute-mode command pattern.
 */
export function executeActionFromPanel(action: KitAction): void {
  // Get kitId from the currently selected result for Custom actions.
  const state = useSearchStore.getState();
  const selectedResult = state.results[state.selectedIndex];
  const kitId = selectedResult?.kitId;

  // Custom actions stay in Flint — no hide, refresh results.
  if (action.type === "Custom") {
    executeAction(action, kitId);
    return;
  }

  // Clipboard actions don't spawn processes — hide after copying.
  if (action.type === "Copy" || action.type === "CopyPath" || action.type === "CopyName") {
    executeAction(action, kitId);
    return;
  }

  // ActivateCommand stays in Flint — no hide.
  if (action.type === "ActivateCommand") {
    executeAction(action, kitId);
    return;
  }

  // For all other actions: hide first, then execute.
  hideWindow()
    .then(() => {
      executeActionAfterHide(action);
    })
    .catch((err: unknown) => {
      console.error("Failed to hide window:", err);
    });
}

/** Fire the IPC call for an action (window already hidden). */
function executeActionAfterHide(action: KitAction): void {
  switch (action.type) {
    case "Open":
      openFile(action.target).catch((err: unknown) => {
        console.error("Failed to open:", err);
      });
      break;
    case "RevealInFileManager":
      revealInFileManager(action.target).catch((err: unknown) => {
        console.error("Failed to reveal:", err);
      });
      break;
    case "Delete":
      deleteToTrash(action.target).catch((err: unknown) => {
        console.error("Failed to delete:", err);
      });
      break;
    case "OpenInEditor":
      openInEditor(action.target).catch((err: unknown) => {
        console.error("Failed to open in editor:", err);
      });
      break;
    default:
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

  executeAction(action, result.kitId);
}

export default function ResultsList() {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const results = useSearchStore((s) => s.results);
  const query = useSearchStore((s) => s.query);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const setSelectedIndex = useSearchStore((s) => s.setSelectedIndex);
  const prevResultsRef = useRef(results);

  // Position the sliding highlight over the selected item.
  useLayoutEffect(() => {
    const highlight = highlightRef.current;
    const container = containerRef.current;
    if (!highlight || !container || results.length === 0) {
      // Hide highlight when results are empty (prevents ghost border).
      if (highlight) {
        highlight.style.display = "none";
      }
      return;
    }

    highlight.style.display = "";

    const items = container.querySelectorAll<HTMLElement>('[role="option"]');
    const selectedEl = items[selectedIndex];
    if (!selectedEl) return;

    // Animate only when navigating within the same result set AND the target
    // item is already visible in the scroll viewport. When the item is
    // off-screen, snap instantly — scrollIntoView handles the rest.
    const itemTop = selectedEl.offsetTop;
    const itemBottom = itemTop + selectedEl.offsetHeight;
    const scrollTop = container.scrollTop;
    const scrollBottom = scrollTop + container.clientHeight;
    const isVisible = itemTop >= scrollTop && itemBottom <= scrollBottom;

    const shouldAnimate = prevResultsRef.current === results && isVisible;
    highlight.className =
      (shouldAnimate ? styles.highlightAnimated : styles.highlight) ?? "";
    highlight.style.top = `${String(selectedEl.offsetTop)}px`;
    highlight.style.height = `${String(selectedEl.offsetHeight)}px`;

    prevResultsRef.current = results;
  }, [results, selectedIndex]);

  // Scroll selected item into view.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = container.querySelectorAll<HTMLElement>('[role="option"]');
    const selected = items[selectedIndex];
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (results.length === 0 && query.length === 0) {
    return null;
  }

  if (results.length === 0 && query.length > 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span>No matches for &ldquo;{query}&rdquo;</span>
          <span className={styles.emptyHint}>
            Try a shorter term or check indexed directories in Settings
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.container} role="listbox" aria-label="Search results">
      <div ref={highlightRef} className={styles.highlight} aria-hidden="true" />
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
