import { useState, useCallback, forwardRef, type KeyboardEvent } from 'react'
import styles from './ChatInput.module.css'

interface SelectedItemSummary {
  id: string
  title: string
}

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  selectedItems?: SelectedItemSummary[]
}

const MAX_VISIBLE_TITLES = 3

function formatSelectedLabel(items: SelectedItemSummary[]): string {
  const visible = items.slice(0, MAX_VISIBLE_TITLES).map((i) => i.title)
  const remainder = items.length - MAX_VISIBLE_TITLES
  return remainder > 0 ? `${visible.join(', ')}...` : visible.join(', ')
}

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(function ChatInput(
  { onSend, disabled, placeholder = 'Ask about your schedule…  /', selectedItems = [] },
  ref
) {
  const [value, setValue] = useState('')

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className={styles.container}>
      <input
        ref={ref}
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus
      />
      <span className={styles.hint}>⏎</span>
      {selectedItems.length > 0 && (
        <div className={styles.withIndicator}>With: {formatSelectedLabel(selectedItems)}</div>
      )}
    </div>
  )
})
