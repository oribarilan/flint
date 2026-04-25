import { CopilotClient } from '@github/copilot-sdk'
import type { ConnectionStatus } from '../types'

const FORCE_STOP_TIMEOUT_MS = 5_000

export interface CopilotManager {
  start(): Promise<void>
  stop(): Promise<void>
  getClient(): CopilotClient | null
  getStatus(): ConnectionStatus
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

export function createCopilotManager(cliPath?: string): CopilotManager {
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
        client = new CopilotClient(cliPath ? { cliPath } : undefined)
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
          let timer: ReturnType<typeof setTimeout> | undefined
          const stopPromise = client.stop()
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => { reject(new Error('Stop timeout')) }, FORCE_STOP_TIMEOUT_MS)
          })
          try {
            await Promise.race([stopPromise, timeout])
          } finally {
            clearTimeout(timer)
          }
        } catch {
          console.warn('[copilot] Graceful stop failed, force-stopping...')
          try {
            await client.forceStop()
          } catch (forceErr) {
            console.error('[copilot] Force-stop error:', forceErr)
          }
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
