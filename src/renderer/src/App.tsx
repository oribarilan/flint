import { useEffect, useCallback, useRef } from "react";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { useAttention } from "./hooks/useAttention";
import { useChat } from "./hooks/useChat";
import { useConfig } from "./hooks/useConfig";
import { useMeetings } from "./hooks/useMeetings";
import { useModelStore } from "./stores/modelStore";
import { useBlockStore } from "./stores/blockStore";
import { derivePillState, FlintBlockSchema } from "../../main/lib/blocks";
import type { PillState } from "../../main/lib/blocks";
import { Greeting } from "./components/Greeting";
import { MeetingRow } from "./components/MeetingRow";
import { AttentionRow } from "./components/AttentionRow";
import { ChatPanel } from "./components/ChatPanel";
import { ChatInput } from "./components/ChatInput";
import { BlockRenderer } from "./components/blocks/BlockRenderer";
import { SuggestionChips } from "./components/blocks/SuggestionChips";
import styles from "./App.module.css";

export default function App() {
  const { items } = useAttention();
  const { messages, streamingContent, isStreaming, sendMessage, clearMessages } = useChat();
  const { config, isLoaded } = useConfig();
  const meetings = useMeetings();
  const setCurrentModel = useModelStore((s) => s.setCurrentModel);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const activeBlock = useBlockStore((s) => s.activeBlock);
  const setActiveBlock = useBlockStore((s) => s.setActiveBlock);
  const clearActiveBlock = useBlockStore((s) => s.clearActiveBlock);

  // Waiting: sent a message, no response yet (no streaming text, no block)
  const isWaiting = isStreaming && !streamingContent && !activeBlock;

  // Only enter chat view when the AI has actually produced text content
  const hasAssistantContent =
    streamingContent.length > 0 || messages.some((m) => m.role === "assistant");
  const isInChat = hasAssistantContent;

  const pillState: PillState =
    isInChat && !activeBlock ? "chat" : derivePillState(activeBlock, isStreaming);

  const handleOpenAttention = useCallback((id: string) => {
    window.flint?.openAttentionItem(id);
  }, []);

  const handleSend = useCallback(
    (prompt: string) => {
      clearActiveBlock();
      sendMessage(prompt);
    },
    [sendMessage, clearActiveBlock],
  );

  const handleBack = useCallback(() => {
    clearActiveBlock();
    clearMessages();
  }, [clearMessages, clearActiveBlock]);

  const handleChipBack = useCallback(() => {
    clearActiveBlock();
  }, [clearActiveBlock]);

  const handleBlockDismiss = useCallback(() => {
    clearActiveBlock();
    chatInputRef.current?.focus();
  }, [clearActiveBlock]);

  const handleJoin = useCallback(() => {
    if (activeBlock?.type === "meeting-card") {
      window.flint?.sendBlocksAction({ type: "join", payload: { meetingId: activeBlock.data.id } });
    }
  }, [activeBlock]);

  // Subscribe to blocks:update IPC
  useEffect(() => {
    const unsub = window.flint?.onBlocksUpdate((raw) => {
      const result = FlintBlockSchema.safeParse(raw);
      if (result.success) {
        setActiveBlock(result.data);
      } else {
        console.warn("[blocks] Invalid block payload dropped", { issues: result.error.issues });
      }
    });
    return () => {
      unsub?.();
    };
  }, [setActiveBlock]);

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

  // Focus chat input when in briefing
  useEffect(() => {
    if (pillState === "briefing") {
      chatInputRef.current?.focus();
    }
  }, [pillState]);

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

  // Clear block state when overlay is hidden
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        clearActiveBlock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearActiveBlock]);

  const isEmpty = meetings.length === 0 && items.length === 0;

  // Determine what to render in the content area
  const renderContent = () => {
    // Active AI block takes priority
    if (activeBlock) {
      return <BlockRenderer block={activeBlock} onDismiss={handleBlockDismiss} />;
    }

    // Chat view (AI is streaming text or has responded)
    if (isInChat) {
      return (
        <>
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
          </div>
        </>
      );
    }

    // Briefing view (default)
    return (
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
    );
  };

  return (
    <div className={styles.window}>
      <div className={styles.pill} data-state={pillState} data-testid="app-root">
        {/* Animated content area */}
        <div className={styles.content} key={activeBlock ? pillState : isInChat ? "chat" : "briefing"}>
          {renderContent()}
        </div>

        {/* Thinking indicator */}
        {isWaiting && (
          <div className={styles.thinking} aria-label="Thinking">
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}

        {/* Stable footer — always at the bottom, never remounts */}
        <SuggestionChips
          pillState={pillState}
          onSend={handleSend}
          onBack={handleChipBack}
          onJoin={handleJoin}
        />
        <div className={styles.footer}>
          <ChatInput
            ref={chatInputRef}
            onSend={handleSend}
            disabled={isStreaming}
            isLoading={isWaiting}
            placeholder={isInChat ? undefined : "Ask Flint anything…"}
          />
        </div>
      </div>
    </div>
  );
}
