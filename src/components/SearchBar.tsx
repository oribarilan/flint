import { useEffect, useRef, type KeyboardEvent } from "react";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import Kbd from "./Kbd";
import styles from "./SearchBar.module.css";

/** SVG paths for result kind icons shown in the actions chip. */
const KIND_ICON_PATHS: Record<string, string> = {
  File: "M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l3.122 3.12a1.5 1.5 0 01.439 1.061V16.5A1.5 1.5 0 0114.5 18h-10A1.5 1.5 0 013 16.5v-13z",
  Directory:
    "M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z",
  Application:
    "M3.25 3A2.25 2.25 0 001 5.25v9.5A2.25 2.25 0 003.25 17h13.5A2.25 2.25 0 0019 14.75v-7.5A2.25 2.25 0 0016.75 5H10.5l-1.72-1.72A2.25 2.25 0 007.2 2.5H3.25zM10 10a1 1 0 011-1h.01a1 1 0 110 2H11a1 1 0 01-1-1zm-4 0a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1z",
};

function ChipKindIcon({ kind }: { kind: string }) {
  const d = KIND_ICON_PATHS[kind];
  if (!d) return null;
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

interface SearchBarProps {
  onArrowDown: () => void;
  onArrowUp?: () => void;
  onSendChat?: () => void;
  onSubmitSearch?: () => void;
}

export default function SearchBar({
  onArrowDown,
  onArrowUp,
  onSendChat,
  onSubmitSearch,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((s) => s.query);
  const isLoading = useSearchStore((s) => s.isLoading);
  const setQuery = useSearchStore((s) => s.setQuery);
  const mode = useSearchStore((s) => s.mode);
  const activeCommand = useSearchStore((s) => s.activeCommand);
  const actionPanelOpen = useSearchStore((s) => s.actionPanelOpen);
  const actionPanelResult = useSearchStore((s) => s.actionPanelResult);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const chatMode = mode === "chat";

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-focus and clear input when action panel opens/closes
  useEffect(() => {
    inputRef.current?.focus();
  }, [actionPanelOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.shiftKey && !chatMode) {
      // Shift+Enter: open Action Panel
      e.preventDefault();
      useSearchStore.getState().openActionPanel();
      return;
    }
    if (e.key === "Enter" && chatMode && onSendChat) {
      e.preventDefault();
      onSendChat();
    } else if (e.key === "Enter" && !chatMode && onSubmitSearch) {
      e.preventDefault();
      onSubmitSearch();
    } else if (e.key === "ArrowDown" && !chatMode) {
      e.preventDefault();
      onArrowDown();
    } else if (e.key === "ArrowUp" && !chatMode && onArrowUp) {
      e.preventDefault();
      onArrowUp();
    }
    // Escape and Tab are handled by useKeybindings
  };

  // Chat mode: sparkle icon; search mode: magnifying glass
  const icon = chatMode ? (
    <svg
      className={styles.icon}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10 1l1.753 5.247L17 8l-5.247 1.753L10 15l-1.753-5.247L3 8l5.247-1.753z" />
    </svg>
  ) : (
    <svg
      className={styles.icon}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );

  // Determine what to show in the search bar: icon, command chip, or actions chip
  const showActionsChip = actionPanelOpen;
  const showCommandChip = !actionPanelOpen && activeCommand;
  const showIcon = !actionPanelOpen && !activeCommand;

  const placeholder = activeCommand
    ? `Search ${activeCommand.name}...`
    : chatMode
      ? "Ask anything..."
      : "Search files...";

  return (
    <div className={chatMode ? styles.wrapperChat : styles.wrapper}>
      {showIcon && icon}

      {showCommandChip && (
        <span className={styles.chip} data-testid="command-chip">
          {activeCommand.name}
        </span>
      )}

      {showActionsChip && actionPanelResult && (
        <span className={styles.chip} data-testid="actions-chip">
          <ChipKindIcon kind={actionPanelResult.kind.type} />
          {actionPanelResult.kind.type}
        </span>
      )}

      {actionPanelOpen && actionPanelResult && (
        <div className={styles.resultInfo}>
          <span className={styles.resultTitle}>{actionPanelResult.title}</span>
          {actionPanelResult.subtitle && (
            <span className={styles.resultSubtitle}>{actionPanelResult.subtitle}</span>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        className={actionPanelOpen ? styles.inputHidden : styles.input}
        type="text"
        value={actionPanelOpen ? "" : query}
        onChange={(e) => {
          if (!actionPanelOpen) setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        readOnly={actionPanelOpen}
        aria-label="Search"
      />

      {(isLoading || (chatMode && isStreaming)) && (
        <div className={styles.spinner} aria-label="Loading" />
      )}

      {!isLoading && !(chatMode && isStreaming) && !actionPanelOpen && <Kbd keys="Tab" />}
    </div>
  );
}
