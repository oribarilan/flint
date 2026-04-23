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
      {isStreaming && streamingContent && (
        <div className={`${styles.message} ${styles.assistant}`}>
          <div className={styles.content}>{streamingContent}</div>
        </div>
      )}
    </div>
  )
}
