import { describe, it, expect, vi } from 'vitest'
import { createSessionManager } from '../copilot/sessions'

describe('SessionManager', () => {
  it('sends chat message and receives deltas', async () => {
    const deltas: string[] = []
    let done = false
    const manager = createSessionManager({
      onChatDelta: (d) => deltas.push(d),
      onChatDone: () => {
        done = true
      },
    })

    await manager.sendChatMessage('hello')
    expect(deltas.length).toBeGreaterThan(0)
    expect(done).toBe(true)
  })

  it('sends monitor poll without error', async () => {
    const manager = createSessionManager({
      onChatDelta: vi.fn(),
      onChatDone: vi.fn(),
    })
    await expect(manager.sendMonitorPoll()).resolves.toBeUndefined()
  })
})
