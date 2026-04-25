import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockStop, mockForceStop, MockCopilotClient } = vi.hoisted(() => {
  const mockStop = vi.fn().mockResolvedValue([])
  const mockForceStop = vi.fn().mockResolvedValue(undefined)
  const MockCopilotClient = vi.fn().mockImplementation(() => ({
    stop: mockStop,
    forceStop: mockForceStop,
    createSession: vi.fn(),
    state: 'disconnected',
  }))
  return { mockStop, mockForceStop, MockCopilotClient }
})

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: MockCopilotClient,
}))

import { createCopilotManager } from '../copilot/client'

describe('CopilotManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStop.mockResolvedValue([])
    mockForceStop.mockResolvedValue(undefined)
  })

  it('creates a manager in disconnected state', () => {
    const manager = createCopilotManager()
    expect(manager.getStatus()).toBe('disconnected')
  })

  it('transitions to connected after start', async () => {
    const manager = createCopilotManager()
    await manager.start()
    expect(manager.getStatus()).toBe('connected')
    expect(MockCopilotClient).toHaveBeenCalledWith(undefined)
  })

  it('passes cliPath when provided', async () => {
    const manager = createCopilotManager('/usr/local/bin/copilot')
    await manager.start()
    expect(MockCopilotClient).toHaveBeenCalledWith({ cliPath: '/usr/local/bin/copilot' })
  })

  it('passes undefined when no cliPath', async () => {
    const manager = createCopilotManager()
    await manager.start()
    expect(MockCopilotClient).toHaveBeenCalledWith(undefined)
  })

  it('calls stop and returns to disconnected', async () => {
    const manager = createCopilotManager()
    await manager.start()
    await manager.stop()
    expect(manager.getStatus()).toBe('disconnected')
    expect(mockStop).toHaveBeenCalled()
  })

  it('force-stops when graceful stop times out', async () => {
    mockStop.mockImplementation(() => new Promise((_resolve) => { /* never resolves */ }))

    const manager = createCopilotManager()
    await manager.start()

    // Use fake timers to avoid real 5s wait
    vi.useFakeTimers()
    const stopPromise = manager.stop()
    vi.advanceTimersByTime(5_000)
    await stopPromise
    vi.useRealTimers()

    expect(mockForceStop).toHaveBeenCalled()
    expect(manager.getStatus()).toBe('disconnected')
    expect(manager.getClient()).toBeNull()
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

  it('sets status to disconnected when constructor throws', async () => {
    MockCopilotClient.mockImplementationOnce(() => {
      throw new Error('connection failed')
    })
    const manager = createCopilotManager()
    await expect(manager.start()).rejects.toThrow('connection failed')
    expect(manager.getStatus()).toBe('disconnected')
    expect(manager.getClient()).toBeNull()
  })
})
