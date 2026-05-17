import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { useAttention } from "./hooks/useAttention";
import { useChat } from "./hooks/useChat";
import { useConfig } from "./hooks/useConfig";
import { useMeetings } from "./hooks/useMeetings";
import { useModelStore } from "./stores/modelStore";
import { Greeting } from "./components/Greeting";
import { MeetingRow } from "./components/MeetingRow";
import { AttentionRow } from "./components/AttentionRow";
import { ChatPanel } from "./components/ChatPanel";
import { ChatInput } from "./components/ChatInput";
import styles from "./App.module.css";

type View = "briefing" | "chat";

export default function App() {
  const [view, setView] = useState<View>("briefing");
  const { items } = useAttention();
  const { messages, streamingContent, isStreaming, sendMessage, clearMessages } = useChat();
  const { config, isLoaded } = useConfig();
  const meetings = useMeetings();
  const setCurrentModel = useModelStore((s) => s.setCurrentModel);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const handleOpenAttention = useCallback((id: string) => {
    window.flint?.openAttentionItem(id);
  }, []);

  const handleSend = useCallback(
    (prompt: string) => {
      sendMessage(prompt);
      setView("chat");
    },
    [sendMessage],
  );

  const handleBack = useCallback(() => {
    setView("briefing");
    clearMessages();
  }, [clearMessages]);

  // Sync model from config
  useEffect(() => {
    if (isLoaded && config.model) {
      setCurrentModel(config.model);
    }
  }, [isLoaded, config.model, setCurrentModel]);

  // Apply font size from config
  useEffect(() => {
    if (isLoaded) {
      document.documentElement.dataset.fontSize = config.fontSize;
    }
  }, [isLoaded, config.fontSize]);

  // Apply theme from main process
  useEffect(() => {
    const unsubTheme = window.flint?.onThemeChanged((theme: string) => {
      document.documentElement.dataset.theme = theme;
    });
    return () => {
      unsubTheme?.();
    };
  }, []);

  useEffect(() => {
    const unsub = window.flint?.onModelChanged((modelId: string) => {
      setCurrentModel(modelId);
    });
    return () => {
      unsub?.();
    };
  }, [setCurrentModel]);

  // Focus chat input when switching to briefing
  useEffect(() => {
    if (view === "briefing") {
      chatInputRef.current?.focus();
    }
  }, [view]);

  // Re-sync config (font size, etc.) when overlay regains focus
  useEffect(() => {
    const handleWindowFocus = (): void => {
      chatInputRef.current?.focus();
      void window.flint?.getConfig().then((cfg) => {
        document.documentElement.dataset.fontSize = cfg.fontSize;
      });
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  const isEmpty = meetings.length === 0 && items.length === 0;

  if (view === "chat") {
    return (
      <div className={styles.window}>
        <div className={styles.pill} data-state="chat" data-testid="app-root">
          <div className={styles.content} key="chat">
            <div className={styles.chatHeader}>
              <button
                className={styles.backButton}
                onClick={handleBack}
                aria-label="Back to briefing"
                type="button"
              >
                <ArrowLeft size={14} />
              </button>
              <span className={styles.chatTitle}>Flint</span>
            </div>
            <div className={styles.chatView}>
              <ChatPanel
                ref={chatPanelRef}
                messages={messages}
                streamingContent={streamingContent}
                isStreaming={isStreaming}
                onSend={sendMessage}
              />
              <div className={styles.footer}>
                <ChatInput ref={chatInputRef} onSend={sendMessage} disabled={isStreaming} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.window}>
      <div className={styles.pill} data-state="briefing" data-testid="app-root">
        <div className={styles.content} key="briefing">
          <div className={styles.body}>
            {isEmpty ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>
                  <CircleCheck size={20} aria-hidden="true" />
                </div>
                <h3 className={styles.emptyTitle}>All clear</h3>
                <p className={styles.emptyDesc}>
                  No meetings or action items right now.
                  <br />
                  Enjoy the focus time.
                </p>
              </div>
            ) : (
              <>
                <Greeting meetings={meetings} />

                {meetings.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionLabel}>Next up</div>
                    <div>
                      {meetings.map((m) => (
                        <MeetingRow key={m.id} meeting={m} />
                      ))}
                    </div>
                  </div>
                )}

                {meetings.length > 0 && items.length > 0 && <div className={styles.divider} />}

                {items.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionLabel}>Attention</div>
                    <div>
                      {items.map((item) => (
                        <AttentionRow key={item.id} item={item} onOpen={handleOpenAttention} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.footer}>
            <ChatInput
              ref={chatInputRef}
              onSend={handleSend}
              disabled={isStreaming}
              placeholder="Ask Flint anything…"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
