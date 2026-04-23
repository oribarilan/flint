import { useMeetings } from './hooks/useMeetings'
import { useChat } from './hooks/useChat'
import { MeetingCards } from './components/MeetingCards'
import { MeetingDetail } from './components/MeetingDetail'
import { ChatPanel } from './components/ChatPanel'
import { ChatInput } from './components/ChatInput'
import styles from './App.module.css'

export default function App() {
  const { meetings, status, selectedMeeting, selectMeeting, clearSelection } = useMeetings()
  const { messages, streamingContent, isStreaming, sendMessage } = useChat()

  const handleJoin = (joinUrl: string): void => {
    window.flint?.joinMeeting(joinUrl)
    window.flint?.hideOverlay()
  }

  if (selectedMeeting) {
    return (
      <div className={styles.root} data-testid="app-root">
        <MeetingDetail meeting={selectedMeeting} onBack={clearSelection} onJoin={handleJoin} />
        <div className={styles.divider} />
        <ChatPanel messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
        <ChatInput onSend={sendMessage} disabled={isStreaming} placeholder="Ask about this meeting..." />
      </div>
    )
  }

  return (
    <div className={styles.root} data-testid="app-root">
      <header className={styles.header}>
        <span className={styles.headerIcon}>⚡</span>
        <span className={styles.headerLabel}>FLINT</span>
      </header>

      {status === 'loading' && (
        <div className={styles.statusMessage}>Checking your calendar...</div>
      )}

      {status === 'error' && (
        <div className={styles.statusMessage}>Couldn&apos;t reach your calendar. Retrying...</div>
      )}

      {status === 'ready' && (
        <MeetingCards
          meetings={meetings}
          alertMinutes={5}
          onSelect={selectMeeting}
          onJoin={handleJoin}
        />
      )}

      <div className={styles.divider} />
      <ChatPanel messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
