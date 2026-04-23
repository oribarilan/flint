import type { ConnectionStatus } from '../types'

// Note: Import from @github/copilot-sdk when available
// For now, define the interface we need
export interface CopilotClientLike {
  createSession(config: unknown): Promise<unknown>
  stop(): Promise<void>
}

export interface CopilotManager {
  start(): Promise<void>
  stop(): Promise<void>
  getClient(): CopilotClientLike | null
  getStatus(): ConnectionStatus
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

export function createCopilotManager(): CopilotManager {
  let client: CopilotClientLike | null = null
  let status: ConnectionStatus = 'disconnected'
  const listeners: Set<(status: ConnectionStatus) => void> = new Set()

  function setStatus(newStatus: ConnectionStatus): void {
    status = newStatus
    for (const listener of listeners) {
      listener(newStatus)
    }
  }

  return {
    async start(): Promise<void> {
      try {
        setStatus('reconnecting')
        // When SDK is available:
        // const { CopilotClient } = await import('@github/copilot-sdk')
        // client = new CopilotClient()
        console.log('[copilot] Client started (SDK integration pending)')
        client = { createSession: async () => null, stop: async () => {} }
        setStatus('connected')
      } catch (err) {
        console.error('[copilot] Failed to start:', err)
        setStatus('disconnected')
        throw err
      }
    },

    async stop(): Promise<void> {
      if (client) {
        await client.stop()
        client = null
      }
      setStatus('disconnected')
    },

    getClient(): CopilotClientLike | null {
      return client
    },

    getStatus(): ConnectionStatus {
      return status
    },

    onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
  }
}
