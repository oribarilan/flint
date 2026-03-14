import { useEffect, useRef } from "react";
import {
  useSearchStore,
  getActionLabel,
  actionRequiresConfirmation,
} from "../stores/searchStore";
import { executeActionFromPanel } from "./ResultsList";
import type { KitAction } from "../kits/types";
import styles from "./ActionPanel.module.css";

const DISARM_TIMEOUT_MS = 3000;

/** SVG icon paths for each action type. */
const ACTION_ICONS: Record<string, string> = {
  Open: "M10.75 6.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z M10 18a8 8 0 100-16 8 8 0 000 16zm0-1.5a6.5 6.5 0 100-13 6.5 6.5 0 000 13z",
  OpenInEditor:
    "M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z",
  OpenInTerminal:
    "M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h13.5A2.25 2.25 0 0019 13.75v-7.5A2.25 2.25 0 0016.75 4H3.25zM5.22 7.47a.75.75 0 011.06 0l2.5 2.5a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 01-1.06-1.06L7.19 10.5 5.22 8.53a.75.75 0 010-1.06zM10.75 12.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z",
  RevealInFileManager:
    "M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z",
  CopyPath:
    "M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 01.439 1.061V9.5A1.5 1.5 0 0114.5 11H13v3.5a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 014 14.5v-9A1.5 1.5 0 015.5 4H7v-.5z",
  CopyName:
    "M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 01.439 1.061V9.5A1.5 1.5 0 0114.5 11H13v3.5a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 014 14.5v-9A1.5 1.5 0 015.5 4H7v-.5z",
  Delete:
    "M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 3.193V3.75A2.75 2.75 0 0011.25 1h-2.5z",
  Copy: "M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 01.439 1.061V9.5A1.5 1.5 0 0114.5 11H13v3.5a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 014 14.5v-9A1.5 1.5 0 015.5 4H7v-.5z",
};

function ActionIcon({ type }: { type: string }) {
  const d = ACTION_ICONS[type];
  if (!d) return null;
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      {d.split(/(?<=z)\s+(?=[A-Z])/).map((path, i) => (
        <path key={i} d={path} fillRule="evenodd" clipRule="evenodd" />
      ))}
    </svg>
  );
}

export default function ActionPanel() {
  const listRef = useRef<HTMLDivElement>(null);
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const result = useSearchStore((s) => s.actionPanelResult);
  const selectedActionIndex = useSearchStore((s) => s.selectedActionIndex);
  const armedActionIndex = useSearchStore((s) => s.armedActionIndex);
  const actionFilterQuery = useSearchStore((s) => s.actionFilterQuery);
  const armAction = useSearchStore((s) => s.armAction);
  const disarmAction = useSearchStore((s) => s.disarmAction);

  // Derive filtered actions — re-computes when filter query or result changes.
  const filteredActions = (() => {
    if (!result) return [];
    if (!actionFilterQuery) return result.actions;
    const lower = actionFilterQuery.toLowerCase();
    return result.actions.filter((a) => getActionLabel(a).toLowerCase().includes(lower));
  })();

  // Scroll selected action into view.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selected = container.children[selectedActionIndex + 1] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedActionIndex]);

  // Auto-disarm timeout.
  useEffect(() => {
    if (armedActionIndex === null) return;

    disarmTimerRef.current = setTimeout(() => {
      disarmAction();
    }, DISARM_TIMEOUT_MS);

    return () => {
      if (disarmTimerRef.current !== null) {
        clearTimeout(disarmTimerRef.current);
        disarmTimerRef.current = null;
      }
    };
  }, [armedActionIndex, disarmAction]);

  if (!result) return null;

  return (
    <div ref={listRef} className={styles.actionList} role="listbox" aria-label="Actions">
      {filteredActions.length === 0 && (
          <div className={styles.emptyState}>No matching actions</div>
        )}
        {filteredActions.map((action, index) => {
        const isDestructive = actionRequiresConfirmation(action);
        const isSelected = index === selectedActionIndex;
        const isArmed = index === armedActionIndex;
        const prevAction = filteredActions[index - 1];
        const showDivider = !!(
          isDestructive && prevAction && !actionRequiresConfirmation(prevAction)
        );

        return (
          <ActionItem
            key={`${action.type}-${String(index)}`}
            action={action}
            index={index}
            isSelected={isSelected}
            isArmed={isArmed}
            isDestructive={isDestructive}
            showDivider={showDivider}
            onExecute={() => {
              handleExecute(action, index, isArmed, armAction);
            }}
          />
        );
      })}
    </div>
  );
}

interface ActionItemProps {
  action: KitAction;
  index: number;
  isSelected: boolean;
  isArmed: boolean;
  isDestructive: boolean;
  showDivider: boolean;
  onExecute: () => void;
}

function ActionItem({
  action,
  index,
  isSelected,
  isArmed,
  isDestructive,
  showDivider,
  onExecute,
}: ActionItemProps) {
  const label = isArmed ? "Press Enter again to delete" : getActionLabel(action);

  const className = isArmed
    ? styles.actionItemArmed
    : isSelected
      ? styles.actionItemSelected
      : styles.actionItem;

  const itemClass = isDestructive && !isArmed
    ? `${className ?? ""} ${styles.destructive ?? ""}`
    : className ?? "";

  return (
    <>
      {showDivider && <div className={styles.divider} />}
      <div
        className={itemClass}
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => {
          // Use the store's raw setter since we're setting action index
          useSearchStore.setState({ selectedActionIndex: index, armedActionIndex: null });
        }}
        onClick={onExecute}
      >
        <div className={styles.actionIcon}>
          <ActionIcon type={action.type} />
        </div>
        <span className={styles.actionLabel}>{label}</span>
      </div>
    </>
  );
}

/** Handle executing or arming an action. */
function handleExecute(
  action: KitAction,
  index: number,
  isArmed: boolean,
  armAction: (index: number) => void,
): void {
  if (actionRequiresConfirmation(action)) {
    if (isArmed) {
      useSearchStore.getState().closeActionPanel();
      executeActionFromPanel(action);
    } else {
      armAction(index);
    }
  } else {
    useSearchStore.getState().closeActionPanel();
    executeActionFromPanel(action);
  }
}
