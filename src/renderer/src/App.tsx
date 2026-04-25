import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Settings as SettingsIcon, Cpu, ChevronUp } from "lucide-react";
import { useAttention } from "./hooks/useAttention";
import { useChat } from "./hooks/useChat";
import { useConfig } from "./hooks/useConfig";
import { useModelStore } from "./stores/modelStore";
import { AttentionPanel } from "./components/AttentionPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ChatInput } from "./components/ChatInput";
import { ModelPicker } from "./components/ModelPicker";
import { Settings } from "./components/Settings";
import styles from "./App.module.css";

export default function App() {
  const { items, selectedIds, toggleSelect } = useAttention();
  const { messages, streamingContent, isStreaming, sendMessage } = useChat();
  const { config, isLoaded, updateConfig } = useConfig();
  const currentModel = useModelStore((s) => s.currentModel);
  const setCurrentModel = useModelStore((s) => s.setCurrentModel);
  const [showSettings, setShowSettings] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

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

      if (e.key === "Escape") {
        e.preventDefault();
        if (isPickerOpen) {
          setIsPickerOpen(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else {
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
  }, [toggleSettings, showSettings, isPickerOpen]);

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

  const handleOpen = (id: string): void => {
    window.flint?.openAttentionItem(id);
  };

  const selectedItemSummaries = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)).map((i) => ({ id: i.id, title: i.title })),
    [items, selectedIds],
  );

  return (
    <div className={styles.root} data-testid="app-root">
      <div className={styles.splitBody}>
        {/* Left panel: attention */}
        <div className={styles.splitLeft}>
          <AttentionPanel
            items={items}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onOpen={handleOpen}
          />
        </div>

        {/* Right panel: chat */}
        <div className={styles.splitRight}>
          <ChatPanel
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            onSend={sendMessage}
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
