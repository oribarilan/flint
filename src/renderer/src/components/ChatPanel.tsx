import { useRef, useEffect, useCallback, forwardRef } from "react";
import { ChatEmptyState } from "./ChatEmptyState";
import styles from "./ChatPanel.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  onSend: (message: string) => void;
  suggestionsKeyboardFocusedIndex?: number | null;
}

const SCROLL_THRESHOLD = 50;

export const ChatPanel = forwardRef<HTMLDivElement, ChatPanelProps>(
  function ChatPanel(
    { messages, streamingContent, isStreaming, onSend, suggestionsKeyboardFocusedIndex },
    ref,
  ) {
    const panelRef = useRef<HTMLDivElement>(null);
    const isNearBottomRef = useRef(true);

    const handleScroll = useCallback(() => {
      const el = panelRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distanceFromBottom <= SCROLL_THRESHOLD;
    }, []);

    useEffect(() => {
      if (!isNearBottomRef.current) return;
      const el = panelRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });

    // Sync the forwarded ref to panelRef (both point to the same element)
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        panelRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    if (messages.length === 0 && !isStreaming) {
      return (
        <ChatEmptyState
          onSend={onSend}
          keyboardFocusedIndex={suggestionsKeyboardFocusedIndex}
        />
      );
    }

    return (
      <div className={styles.panel} ref={setRefs} onScroll={handleScroll}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
            <div className={styles.content}>{msg.content}</div>
          </div>
        ))}
        {isStreaming && (
          <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.content}>
              {streamingContent || <span className={styles.thinking}>Thinking…</span>}
            </div>
          </div>
        )}
      </div>
    );
  },
);
