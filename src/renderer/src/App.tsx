import { useState, useEffect, useCallback, useMemo } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { useAttention } from "./hooks/useAttention";
import { useChat } from "./hooks/useChat";
import { useConfig } from "./hooks/useConfig";
import { AttentionPanel } from "./components/AttentionPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ChatInput } from "./components/ChatInput";
import { Settings } from "./components/Settings";
import styles from "./App.module.css";

export default function App() {
  const { items, selectedIds, toggleSelect } = useAttention();
  const { messages, streamingContent, isStreaming, sendMessage } = useChat();
  const { config, isLoaded, updateConfig } = useConfig();
  const [showSettings, setShowSettings] = useState(false);

  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSettings]);

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
          />
          <ChatInput
            onSend={sendMessage}
            disabled={isStreaming}
            selectedItems={selectedItemSummaries}
          />
        </div>
      </div>

      <footer className={styles.bottomBar}>
        <button
          className={styles.settingsButton}
          onClick={toggleSettings}
          aria-label="Open settings"
          type="button"
        >
          <SettingsIcon size={16} />
        </button>
      </footer>

      {showSettings && isLoaded && (
        <Settings config={config} onUpdate={updateConfig} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
