import { approveAll, type CopilotSession, type Tool } from '@github/copilot-sdk'
import type { CopilotClient } from '@github/copilot-sdk'

const CHAT_TIMEOUT_MS = 60_000 // 60s timeout for chat
const MONITOR_TIMEOUT_MS = 90_000 // 90s timeout for monitor (MCP startup can be slow)

interface SessionManagerConfig {
  client: CopilotClient
  monitorTools?: Tool[]
  chatTools?: Tool[]
  onChatDelta: (delta: string) => void
  onChatDone: () => void
  onChatError?: (error: string) => void
}

export interface SessionManager {
  sendChatMessage(prompt: string): Promise<void>
  sendMonitorPoll(): Promise<void>
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  let chatSession: CopilotSession | null = null
  let monitorSession: CopilotSession | null = null

  function reportError(message: string): void {
    console.error('[sessions]', message)
    if (config.onChatError) {
      config.onChatError(message)
    } else {
      // Fallback: send error as a delta so user sees it
      config.onChatDelta(`\n\n⚠️ ${message}`)
      config.onChatDone()
    }
  }

  async function getChatSession(): Promise<CopilotSession> {
    if (chatSession) return chatSession

    console.log('[sessions] Creating chat session...')
    chatSession = await config.client.createSession({
      sessionId: 'flint-main',
      model: 'gpt-4.1',
      onPermissionRequest: approveAll,
      streaming: true,
      systemMessage: {
        content: 'You are Flint, a work assistant. Help the user with questions about their schedule, meetings, and work context. Be concise and helpful.',
      },
      tools: config.chatTools,
    })
    console.log('[sessions] Chat session created:', chatSession.sessionId)

    chatSession.on('assistant.message_delta', (event) => {
      config.onChatDelta(event.data.deltaContent)
    })

    chatSession.on('session.idle', () => {
      config.onChatDone()
    })

    return chatSession
  }

  async function getMonitorSession(): Promise<CopilotSession> {
    if (monitorSession) return monitorSession

    console.log('[sessions] Creating monitor session...')
    monitorSession = await config.client.createSession({
      sessionId: 'flint-monitor',
      model: 'gpt-4.1',
      onPermissionRequest: approveAll,
      tools: config.monitorTools,
    })
    console.log('[sessions] Monitor session created:', monitorSession.sessionId)

    return monitorSession
  }

  return {
    async sendChatMessage(prompt: string): Promise<void> {
      try {
        const session = await getChatSession()
        console.log('[chat] Sending:', prompt)
        await session.sendAndWait({ prompt }, CHAT_TIMEOUT_MS)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[chat] sendAndWait error:', message)
        if (message.includes('timeout') || message.includes('Timeout')) {
          reportError('Response timed out. Try again.')
        } else {
          reportError(`Chat error: ${message}`)
        }
      }
    },

    async sendMonitorPoll(): Promise<void> {
      try {
        const session = await getMonitorSession()
        console.log('[monitor] Polling...')
        await session.sendAndWait({
          prompt: 'Check for upcoming meetings and report them using the report_meetings tool.',
        }, MONITOR_TIMEOUT_MS)
        console.log('[monitor] Poll complete')
      } catch (err) {
        console.error('[monitor] Poll error:', err instanceof Error ? err.message : err)
        // Don't surface monitor errors to user — just log and retry next cycle
      }
    },
  }
}
