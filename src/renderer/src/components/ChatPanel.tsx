import styles from './ChatPanel.module.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
}

export function ChatPanel({ messages, streamingContent, isStreaming }: ChatPanelProps) {
  if (messages.length === 0 && !isStreaming) return null

  return (
    <div className={styles.panel}>
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
  )
}
