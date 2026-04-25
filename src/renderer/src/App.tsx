import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Settings as SettingsIcon, Cpu, ChevronUp } from "lucide-react";
import { useAttention } from "./hooks/useAttention";
import { useChat } from "./hooks/useChat";
import { useConfig } from "./hooks/useConfig";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { useModelStore } from "./stores/modelStore";
import { useAttentionStore } from "./stores/attentionStore";
import { buildSuggestions } from "./utils/suggestions";
import { AttentionPanel } from "./components/AttentionPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ChatInput } from "./components/ChatInput";
import { HotkeyHint, HotkeyGroup } from "./components/HotkeyHint";
import { ModelPicker } from "./components/ModelPicker";
import { Settings } from "./components/Settings";
import styles from "./App.module.css";

export default function App() {
  const { items, selectedIds, toggleSelect } = useAttention();
  const { messages, streamingContent, isStreaming, sendMessage, clearMessages } = useChat();
  const { config, isLoaded, updateConfig } = useConfig();
  const currentModel = useModelStore((s) => s.currentModel);
  const setCurrentModel = useModelStore((s) => s.setCurrentModel);
  const [showSettings, setShowSettings] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const handleOpen = (id: string): void => {
    window.flint?.openAttentionItem(id);
  };

  const suggestions = buildSuggestions(items);

  const { focusedPanel, focusedIndex, resetFocus } = useKeyboardNav({
    items,
    suggestions,
    hasMessages: messages.length > 0,
    isStreaming,
    chatPanelRef,
    chatInputRef,
    toggleSelect,
    onOpen: handleOpen,
    sendMessage,
  });

  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev);
  }, []);

  const togglePicker = useCallback(() => {
    setIsPickerOpen((prev) => !prev);
  }, []);

  const closePicker = useCallback(() => setIsPickerOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        window.flint?.chatReset();
        clearMessages();
        useAttentionStore.getState().clearSelection();
        chatInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (isPickerOpen) {
          setIsPickerOpen(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else {
          resetFocus();
          window.flint?.hideOverlay();
        }
        return;
      }

      if (e.key === "/") {
        const el = document.activeElement;
        const isText =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable);
        if (!isText) {
          e.preventDefault();
          chatInputRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSettings, showSettings, isPickerOpen, resetFocus, clearMessages]);

  // Sync model from config on init + subscribe to model:changed from main
  useEffect(() => {
    if (isLoaded && config.model) {
      setCurrentModel(config.model);
    }
  }, [isLoaded, config.model, setCurrentModel]);

  useEffect(() => {
    const unsub = window.flint?.onModelChanged((modelId: string) => {
      setCurrentModel(modelId);
    });
    return () => unsub?.();
  }, [setCurrentModel]);

  const selectedItemSummaries = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)).map((i) => ({ id: i.id, title: i.title })),
    [items, selectedIds],
  );

  const attentionFocusedIndex = focusedPanel === "attention" ? focusedIndex : null;
  const suggestionsFocusedIndex = focusedPanel === "suggestions" ? focusedIndex : null;

  return (
    <div className={styles.root} data-testid="app-root">
      <div className={styles.splitBody}>
        {/* Left panel: attention */}
        <div className={styles.splitLeft}>
          <AttentionPanel
            items={items}
            selectedIds={selectedIds}
            keyboardFocusedIndex={attentionFocusedIndex}
            onSelect={toggleSelect}
            onOpen={handleOpen}
          />
        </div>

        {/* Right panel: chat */}
        <div className={styles.splitRight}>
          <ChatPanel
            ref={chatPanelRef}
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            onSend={sendMessage}
            suggestionsKeyboardFocusedIndex={suggestionsFocusedIndex}
          />
          <ChatInput
            ref={chatInputRef}
            onSend={sendMessage}
            disabled={isStreaming}
            selectedItems={selectedItemSummaries}
          />
        </div>
      </div>

      <footer className={styles.bottomBar}>
        <button
          ref={modelButtonRef}
          className={styles.modelIndicator}
          onClick={togglePicker}
          aria-label={`Current model: ${currentModel}`}
          aria-expanded={isPickerOpen}
          aria-haspopup="listbox"
          type="button"
        >
          <Cpu size={16} aria-hidden="true" />
          <span className={styles.modelName}>{currentModel}</span>
          <ChevronUp
            size={12}
            className={`${styles.modelChevron} ${isPickerOpen ? styles.modelChevronOpen : ""}`}
            aria-hidden="true"
          />
        </button>
        <div className={styles.hints} aria-hidden="true">
          <HotkeyHint keys={["cmd", "n"]} />
          <span className={styles.hintLabel}>new chat</span>
          <span className={styles.hintSeparator}>·</span>
          <HotkeyGroup modifier="ctrl" keys={["h", "j", "k", "l"]} />
          <span className={styles.hintLabel}>navigate</span>
          <span className={styles.hintSeparator}>·</span>
          <HotkeyGroup modifier="ctrl" keys={["u", "d"]} />
          <span className={styles.hintLabel}>scroll</span>
          <span className={styles.hintSeparator}>·</span>
          <HotkeyHint keys={["enter"]} />
          <span className={styles.hintLabel}>open</span>
          <span className={styles.hintSeparator}>·</span>
          <HotkeyHint keys={["space"]} />
          <span className={styles.hintLabel}>select</span>
        </div>
        <button
          className={styles.settingsButton}
          onClick={toggleSettings}
          aria-label="Open settings"
          type="button"
        >
          <SettingsIcon size={16} />
        </button>
        {isPickerOpen && <ModelPicker onClose={closePicker} triggerRef={modelButtonRef} />}
      </footer>

      {showSettings && isLoaded && (
        <Settings config={config} onUpdate={updateConfig} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
