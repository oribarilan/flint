import { useState, useEffect, useCallback } from 'react'
import { useMeetings } from './hooks/useMeetings'
import { useAttention } from './hooks/useAttention'
import { useChat } from './hooks/useChat'
import { useConfig } from './hooks/useConfig'
import { AttentionPanel } from './components/AttentionPanel'
import { MeetingDetail } from './components/MeetingDetail'
import { ChatPanel } from './components/ChatPanel'
import { ChatInput } from './components/ChatInput'
import { Settings } from './components/Settings'
import styles from './App.module.css'

export default function App() {
  const { selectedMeeting, clearSelection } = useMeetings()
  const { items, selectedIds, toggleSelect } = useAttention()
  const { messages, streamingContent, isStreaming, sendMessage } = useChat()
  const { config, isLoaded, updateConfig } = useConfig()
  const [showSettings, setShowSettings] = useState(false)

  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        toggleSettings()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggleSettings])

  const handleJoin = (joinUrl: string): void => {
    window.flint?.joinMeeting(joinUrl)
    window.flint?.hideOverlay()
  }

  const handleOpen = (id: string): void => {
    window.flint?.openAttentionItem(id)
  }

  // Meeting detail view (full panel, replaces split)
  if (selectedMeeting) {
    return (
      <div className={styles.root} data-testid="app-root">
        <MeetingDetail meeting={selectedMeeting} onBack={clearSelection} onJoin={handleJoin} />
        <div className={styles.divider} />
        <ChatPanel messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
        <ChatInput onSend={sendMessage} disabled={isStreaming} placeholder="Ask about this meeting..." />
        {showSettings && isLoaded && (
          <Settings config={config} onUpdate={updateConfig} onClose={() => setShowSettings(false)} />
        )}
      </div>
    )
  }

  // Default view: split layout
  return (
    <div className={styles.root} data-testid="app-root">
      <header className={styles.header}>
        <span className={styles.headerIcon}>⚡</span>
        <span className={styles.headerLabel}>FLINT</span>
        <button
          className={styles.settingsButton}
          onClick={toggleSettings}
          aria-label="Open settings"
          type="button"
        >
          ⚙
        </button>
      </header>

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
          <ChatPanel messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
          <ChatInput onSend={sendMessage} disabled={isStreaming} />
        </div>
      </div>

      {showSettings && isLoaded && (
        <Settings config={config} onUpdate={updateConfig} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
