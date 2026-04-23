import { useEffect, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'

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
      window.flint?.chatSend(prompt)
    },
    [addUserMessage, isStreaming]
  )

  return { messages, streamingContent, isStreaming, sendMessage, clearMessages }
}
