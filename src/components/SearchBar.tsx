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
  const modelPickerOpen = useChatStore((s) => s.modelPickerOpen);
  const modelPickerQuery = useChatStore((s) => s.modelPickerQuery);
  const selectedModel = useChatStore((s) => s.selectedModel);

  const agentMode = mode === "agent";

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-focus when action panel or model picker opens/closes
  useEffect(() => {
    inputRef.current?.focus();
  }, [actionPanelOpen, modelPickerOpen]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Model picker mode — intercept navigation and selection
    if (modelPickerOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const state = useChatStore.getState();
        const filtered = state.availableModels.filter(
          (m) =>
            !state.modelPickerQuery ||
            m.name.toLowerCase().includes(state.modelPickerQuery.toLowerCase()) ||
            m.providerName.toLowerCase().includes(state.modelPickerQuery.toLowerCase()),
        );
        const next = Math.min(state.modelPickerIndex + 1, filtered.length - 1);
        useChatStore.getState().setModelPickerIndex(next);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = useChatStore.getState().modelPickerIndex;
        useChatStore.getState().setModelPickerIndex(Math.max(0, idx - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const state = useChatStore.getState();
        const filtered = state.availableModels.filter(
          (m) =>
            !state.modelPickerQuery ||
            m.name.toLowerCase().includes(state.modelPickerQuery.toLowerCase()) ||
            m.providerName.toLowerCase().includes(state.modelPickerQuery.toLowerCase()),
        );
        const model = filtered[state.modelPickerIndex];
        if (model) {
          useChatStore.getState().setSelectedModel({
            providerId: model.providerId,
            modelId: model.id.split("/").slice(1).join("/"),
            displayName: model.name,
          });
          useChatStore.getState().closeModelPicker();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        useChatStore.getState().closeModelPicker();
        return;
      }
      return;
    }

    if (e.key === "Enter" && e.shiftKey && !agentMode) {
      e.preventDefault();
      useSearchStore.getState().openActionPanel();
      return;
    }
    if (e.key === "Enter" && agentMode && onSendChat) {
      e.preventDefault();
      onSendChat();
    } else if (e.key === "Enter" && !agentMode && onSubmitSearch) {
      e.preventDefault();
      onSubmitSearch();
    } else if (e.key === "ArrowDown" && !agentMode) {
      e.preventDefault();
      onArrowDown();
    } else if (e.key === "ArrowUp" && !agentMode && onArrowUp) {
      e.preventDefault();
      onArrowUp();
    }
  };

  // Agent mode: sparkle icon; search mode: magnifying glass
  const icon = agentMode ? (
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

  // Determine what to show in the search bar
  const showActionsChip = actionPanelOpen;
  const showModelChip = !actionPanelOpen && modelPickerOpen;
  const showCommandChip = !actionPanelOpen && !modelPickerOpen && activeCommand;
  const showIcon = !actionPanelOpen && !modelPickerOpen && !activeCommand;

  const placeholder = modelPickerOpen
    ? "Search models..."
    : activeCommand
      ? `Search ${activeCommand.name}...`
      : agentMode
        ? "Ask anything..."
        : "Search files...";

  // Determine input value and change handler
  const inputValue = modelPickerOpen ? modelPickerQuery : actionPanelOpen ? "" : query;
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (modelPickerOpen) {
      useChatStore.getState().setModelPickerQuery(e.target.value);
    } else if (!actionPanelOpen) {
      setQuery(e.target.value);
    }
  };

  return (
    <div className={agentMode ? styles.wrapperAgent : styles.wrapper}>
      {showIcon && icon}

      {showModelChip && (
        <span className={styles.chip} data-testid="model-chip">
          {selectedModel?.displayName ?? "Model"}
        </span>
      )}

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
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        readOnly={actionPanelOpen}
        aria-label="Search"
      />

      {!isLoading && !(agentMode && isStreaming) && !actionPanelOpen && !modelPickerOpen && (
        <Kbd keys="Tab" />
      )}
    </div>
  );
}
