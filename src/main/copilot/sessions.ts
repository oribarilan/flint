import { approveAll, type CopilotSession, type Tool } from '@github/copilot-sdk'
import type { CopilotClient } from '@github/copilot-sdk'
import { CHAT_SYSTEM_PROMPT } from './system-prompt'
import { buildMonitorPrompt, MONITOR_SYSTEM_PROMPT } from '../pulse/prompts'
import type { MonitorPollContext } from '../pulse/prompts'

export type { MonitorPollContext }

const CHAT_TIMEOUT_MS = 60_000 // 60s timeout for chat
const MONITOR_TIMEOUT_MS = 90_000 // 90s timeout for monitor (MCP startup can be slow)

interface SessionManagerConfig {
  client: CopilotClient
  getModel: () => string
  getPollModel: () => string
  monitorTools?: Tool[]
  chatTools?: Tool[]
  onChatDelta: (delta: string) => void
  onChatDone: () => void
  onChatError?: (error: string) => void
}

export interface SessionManager {
  sendChatMessage(prompt: string): Promise<void>
  sendMonitorPoll(context: MonitorPollContext): Promise<void>
  resetChat(): Promise<void>
  getChatSession(): CopilotSession | null
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

  async function ensureChatSession(): Promise<CopilotSession> {
    if (chatSession) return chatSession

    const model = config.getModel()
    console.log('[sessions] Creating chat session with model:', model)
    chatSession = await config.client.createSession({
      sessionId: 'flint-main',
      model,
      onPermissionRequest: approveAll,
      streaming: true,
      systemMessage: {
        content: CHAT_SYSTEM_PROMPT,
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

    const model = config.getPollModel()
    console.log('[sessions] Creating monitor session with model:', model)
    monitorSession = await config.client.createSession({
      sessionId: 'flint-monitor',
      model,
      onPermissionRequest: approveAll,
      systemMessage: {
        content: MONITOR_SYSTEM_PROMPT,
      },
      tools: config.monitorTools,
    })
    console.log('[sessions] Monitor session created:', monitorSession.sessionId)

    return monitorSession
  }

  return {
    async sendChatMessage(prompt: string): Promise<void> {
      try {
        const session = await ensureChatSession()
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

    async sendMonitorPoll(context: MonitorPollContext): Promise<void> {
      try {
        const session = await getMonitorSession()
        const prompt = buildMonitorPrompt(context)
        console.log('[monitor] Polling...')
        await session.sendAndWait({ prompt }, MONITOR_TIMEOUT_MS)
        console.log('[monitor] Poll complete')
      } catch (err) {
        console.error('[monitor] Poll error:', err instanceof Error ? err.message : err)
        // Don't surface monitor errors to user — just log and retry next cycle
      }
    },

    async resetChat(): Promise<void> {
      if (chatSession) {
        try {
          await chatSession.abort()
        } catch {
          // session may not have an active request
        }
        chatSession = null
        console.log('[sessions] Chat session reset')
      }
    },

    getChatSession(): CopilotSession | null {
      return chatSession
    },
  }
}
