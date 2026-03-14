import { useEffect, useRef, type KeyboardEvent } from "react";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import Kbd from "./Kbd";
import styles from "./SearchBar.module.css";

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
  const actionFilterQuery = useSearchStore((s) => s.actionFilterQuery);
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

  const inputValue = actionPanelOpen ? actionFilterQuery : query;
  const placeholder = actionPanelOpen
    ? "Filter actions\u2026"
    : activeCommand
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

      {showActionsChip && (
        <span className={styles.chip} data-testid="actions-chip">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path d="M10 3.75a2 2 0 10-4 0 2 2 0 004 0zM17.25 4.5a.75.75 0 000-1.5h-5.5a.75.75 0 000 1.5h5.5zM5 3.75a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75zM4.25 17a.75.75 0 000-1.5h-1.5a.75.75 0 000 1.5h1.5zM17.25 17a.75.75 0 000-1.5h-5.5a.75.75 0 000 1.5h5.5zM9 10a2 2 0 10-4 0 2 2 0 004 0zM17.25 10.75a.75.75 0 000-1.5h-5.5a.75.75 0 000 1.5h5.5zM4.25 10.75a.75.75 0 000-1.5h-1.5a.75.75 0 000 1.5h1.5zM14 16.25a2 2 0 10-4 0 2 2 0 004 0z" />
          </svg>
          Actions
        </span>
      )}

      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={inputValue}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label="Search"
      />

      {(isLoading || (chatMode && isStreaming)) && (
        <div className={styles.spinner} aria-label="Loading" />
      )}

      {!isLoading && !(chatMode && isStreaming) && <Kbd keys="Tab" />}
    </div>
  );
}
