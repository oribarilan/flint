import { approveAll, type CopilotSession, type Tool } from '@github/copilot-sdk'
import type { CopilotClient } from '@github/copilot-sdk'

interface SessionManagerConfig {
  client: CopilotClient
  monitorTools?: Tool[]
  chatTools?: Tool[]
  onChatDelta: (delta: string) => void
  onChatDone: () => void
}

export interface SessionManager {
  sendChatMessage(prompt: string): Promise<void>
  sendMonitorPoll(): Promise<void>
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  let chatSession: CopilotSession | null = null
  let monitorSession: CopilotSession | null = null

  async function getChatSession(): Promise<CopilotSession> {
    if (chatSession) return chatSession

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

    monitorSession = await config.client.createSession({
      sessionId: 'flint-monitor',
      model: 'gpt-4.1',
      onPermissionRequest: approveAll,
      tools: config.monitorTools,
    })

    return monitorSession
  }

  return {
    async sendChatMessage(prompt: string): Promise<void> {
      const session = await getChatSession()
      console.log('[chat] Sending:', prompt)
      try {
        await session.sendAndWait({ prompt })
      } catch (err) {
        console.error('[chat] sendAndWait error:', err)
        config.onChatDone()
      }
    },

    async sendMonitorPoll(): Promise<void> {
      const session = await getMonitorSession()
      await session.sendAndWait({
        prompt: 'Check for upcoming meetings and report them using the report_meetings tool.',
      })
    },
  }
}
