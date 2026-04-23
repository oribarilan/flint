import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStart, mockStop, MockCopilotClient } = vi.hoisted(() => {
  const mockStart = vi.fn()
  const mockStop = vi.fn().mockResolvedValue([])
  const MockCopilotClient = vi.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
    createSession: vi.fn(),
  }))
  return { mockStart, mockStop, MockCopilotClient }
})

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: MockCopilotClient,
}))

import { createCopilotManager } from '../copilot/client'

describe('CopilotManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a manager in disconnected state', () => {
    const manager = createCopilotManager()
    expect(manager.getStatus()).toBe('disconnected')
  })

  it('transitions to connected after start', async () => {
    const manager = createCopilotManager()
    await manager.start()
    expect(manager.getStatus()).toBe('connected')
    expect(MockCopilotClient).toHaveBeenCalledWith({ autoStart: false })
    expect(mockStart).toHaveBeenCalled()
  })

  it('calls stop and returns to disconnected', async () => {
    const manager = createCopilotManager()
    await manager.start()
    await manager.stop()
    expect(manager.getStatus()).toBe('disconnected')
    expect(mockStop).toHaveBeenCalled()
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

  it('sets status to disconnected when start fails', async () => {
    mockStart.mockRejectedValueOnce(new Error('connection failed'))
    const manager = createCopilotManager()
    await expect(manager.start()).rejects.toThrow('connection failed')
    expect(manager.getStatus()).toBe('disconnected')
    expect(manager.getClient()).toBeNull()
  })
})
