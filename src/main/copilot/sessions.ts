interface SessionManagerConfig {
  onChatDelta: (delta: string) => void
  onChatDone: () => void
}

export interface SessionManager {
  sendChatMessage(prompt: string): Promise<void>
  sendMonitorPoll(): Promise<void>
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  return {
    async sendChatMessage(prompt: string): Promise<void> {
      // When SDK is available, this will forward to the chat session
      console.log('[sessions] Chat message:', prompt)
      // Simulate a response for now
      config.onChatDelta("I'm Flint, your work assistant. ")
      config.onChatDelta('The Copilot SDK integration is pending — ')
      config.onChatDelta("I'll be able to check your calendar once connected.")
      config.onChatDone()
    },

    async sendMonitorPoll(): Promise<void> {
      // When SDK is available, this will send to the monitor session with Work IQ MCP
      console.log('[sessions] Monitor poll (SDK pending)')
    },
  }
}
