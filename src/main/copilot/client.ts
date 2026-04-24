import { CopilotClient } from '@github/copilot-sdk'
import type { ConnectionStatus } from '../types'

export interface CopilotManager {
  start(): Promise<void>
  stop(): Promise<void>
  getClient(): CopilotClient | null
  getStatus(): ConnectionStatus
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

export function createCopilotManager(): CopilotManager {
  let client: CopilotClient | null = null
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
        // No args needed — SDK auto-manages the CLI process.
        // CLI starts lazily on first createSession() call.
        client = new CopilotClient()
        console.log('[copilot] Client created, state:', client.state)
        setStatus('connected')
      } catch (err) {
        console.error('[copilot] Failed to create client:', err)
        client = null
        setStatus('disconnected')
        throw err
      }
    },

    async stop(): Promise<void> {
      if (client) {
        try {
          await client.stop()
        } catch (err) {
          console.error('[copilot] Stop error:', err)
        }
        client = null
      }
      setStatus('disconnected')
    },

    getClient(): CopilotClient | null {
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
