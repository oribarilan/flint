import { MarkdownContent } from "../MarkdownContent";
import styles from "./ChatMessage.module.css";

interface ChatMessageProps {
  content: string;
}

export function ChatMessage({ content }: ChatMessageProps) {
  return (
    <div className={styles.message} data-testid="chat-message">
      <MarkdownContent content={content} />
    </div>
  );
}
