import { useRef, useEffect, useCallback } from "react";
import styles from "./ChatPanel.module.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

const SCROLL_THRESHOLD = 50;

export function ChatPanel({ messages, streamingContent, isStreaming }: ChatPanelProps) {
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

  if (messages.length === 0 && !isStreaming) return null;

  return (
    <div className={styles.panel} ref={panelRef} onScroll={handleScroll}>
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
}
