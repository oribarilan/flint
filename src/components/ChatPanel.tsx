import { useEffect, useRef } from "react";
import { useChatStore, type ChatMessage } from "../stores/chatStore";
import styles from "./ChatPanel.module.css";

/** Display name for a tool. */
function toolDisplayName(toolName: string): string {
  const names: Record<string, string> = {
    calculate: "Calculator",
    search_files: "File Search",
  };
  return names[toolName] ?? toolName;
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === "error") {
    return <div className={styles.error}>{message.content}</div>;
  }

  const isUser = message.role === "user";
  return (
    <div className={isUser ? styles.userMessage : styles.assistantMessage}>{message.content}</div>
  );
}

export default function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentResponse = useChatStore((s) => s.currentResponse);
  const activeToolCalls = useChatStore((s) => s.activeToolCalls);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, currentResponse, activeToolCalls]);

  if (messages.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div ref={containerRef} className={styles.container}>
      {messages.map((msg, i) => (
        <Message key={i} message={msg} />
      ))}
      {activeToolCalls.length > 0 && (
        <div className={styles.thinking}>
          {activeToolCalls.map((tc) => `Using ${toolDisplayName(tc.toolName)}…`).join(" ")}
        </div>
      )}
      {isStreaming && currentResponse.length > 0 && (
        <div className={styles.assistantMessage}>{currentResponse}</div>
      )}
      {isStreaming && currentResponse.length === 0 && activeToolCalls.length === 0 && (
        <div className={styles.thinking}>Thinking…</div>
      )}
    </div>
  );
}
