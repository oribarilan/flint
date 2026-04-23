import { describe, it, expect } from 'vitest'
import { createCopilotManager } from '../copilot/client'

describe('CopilotManager', () => {
  it('creates a manager in disconnected state', () => {
    const manager = createCopilotManager()
    expect(manager.getStatus()).toBe('disconnected')
  })

  it('transitions to connected after start', async () => {
    const manager = createCopilotManager()
    await manager.start()
    expect(manager.getStatus()).toBe('connected')
  })

  it('calls stop and returns to disconnected', async () => {
    const manager = createCopilotManager()
    await manager.start()
    await manager.stop()
    expect(manager.getStatus()).toBe('disconnected')
  })

  it('notifies status change listeners', async () => {
    const manager = createCopilotManager()
    const statuses: string[] = []
    manager.onStatusChange((s) => statuses.push(s))
    await manager.start()
    expect(statuses).toContain('reconnecting')
    expect(statuses).toContain('connected')
  })

  it('unsubscribe stops notifications', async () => {
    const manager = createCopilotManager()
    const statuses: string[] = []
    const unsub = manager.onStatusChange((s) => statuses.push(s))
    unsub()
    await manager.start()
    expect(statuses).toHaveLength(0)
  })

  it('returns null client before start', () => {
    const manager = createCopilotManager()
    expect(manager.getClient()).toBeNull()
  })

  it('returns client after start', async () => {
    const manager = createCopilotManager()
    await manager.start()
    expect(manager.getClient()).not.toBeNull()
  })

  it('returns null client after stop', async () => {
    const manager = createCopilotManager()
    await manager.start()
    await manager.stop()
    expect(manager.getClient()).toBeNull()
  })
})
