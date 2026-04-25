import { useEffect, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useAttentionStore } from '../stores/attentionStore'
import type { AttentionItem } from '../../../main/types'

function buildContextPrefix(selectedItems: AttentionItem[]): string {
  if (selectedItems.length === 0) return ''

  const lines = selectedItems.map((item) => {
    const metadata = item.metadata ?? {}
    const metaParts = Object.entries(metadata).map(([k, v]) => `${k}=${v}`)
    const metaSuffix = metaParts.length > 0 ? `. ${metaParts.join(', ')}` : ''
    return `- ${item.icon} ${item.title}: ${item.description}${metaSuffix}`
  })

  return `[Context — selected items:\n${lines.join('\n')}]\n\n`
}

export function useChat() {
  const { messages, streamingContent, isStreaming, addUserMessage, appendDelta, finishStreaming, clearMessages } =
    useChatStore()

  useEffect(() => {
    const unsubDelta = window.flint?.onChatDelta((delta) => appendDelta(delta))
    const unsubDone = window.flint?.onChatDone(() => finishStreaming())
    return () => {
      unsubDelta?.()
      unsubDone?.()
    }
  }, [appendDelta, finishStreaming])

  const sendMessage = useCallback(
    (prompt: string) => {
      if (!prompt.trim() || isStreaming) return
      addUserMessage(prompt)

      try {
        const selectedItems = useAttentionStore.getState().getSelectedItems()
        const prefix = buildContextPrefix(selectedItems)
        window.flint?.chatSend(prefix + prompt)
      } catch (err) {
        console.error('[chat] Failed to send message:', err)
        finishStreaming()
      }
    },
    [addUserMessage, isStreaming, finishStreaming]
  )

  return { messages, streamingContent, isStreaming, sendMessage, clearMessages }
}
