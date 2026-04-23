import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendAndWait = vi.fn().mockResolvedValue(undefined)
const mockOn = vi.fn()
const mockCreateSession = vi.fn().mockResolvedValue({
  sendAndWait: mockSendAndWait,
  on: mockOn,
})

vi.mock('@github/copilot-sdk', () => ({
  approveAll: vi.fn(),
}))

import { createSessionManager } from '../copilot/sessions'

function createMockClient() {
  return {
    createSession: mockCreateSession,
    start: vi.fn(),
    stop: vi.fn(),
  } as any
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends chat message and creates session lazily', async () => {
    const onChatDelta = vi.fn()
    const onChatDone = vi.fn()
    const client = createMockClient()

    const manager = createSessionManager({
      client,
      onChatDelta,
      onChatDone,
    })

    await manager.sendChatMessage('hello')

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'flint-main',
        streaming: true,
      })
    )
    expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'hello' })
    expect(onChatDone).toHaveBeenCalled()
  })

  it('reuses existing chat session on subsequent calls', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      onChatDelta: vi.fn(),
      onChatDone: vi.fn(),
    })

    await manager.sendChatMessage('first')
    await manager.sendChatMessage('second')

    expect(mockCreateSession).toHaveBeenCalledTimes(1)
    expect(mockSendAndWait).toHaveBeenCalledTimes(2)
  })

  it('registers delta event handler on chat session', async () => {
    const onChatDelta = vi.fn()
    const client = createMockClient()

    const manager = createSessionManager({
      client,
      onChatDelta,
      onChatDone: vi.fn(),
    })

    await manager.sendChatMessage('test')

    expect(mockOn).toHaveBeenCalledWith('assistant.message_delta', expect.any(Function))
  })

  it('sends monitor poll and creates monitor session', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      onChatDelta: vi.fn(),
      onChatDone: vi.fn(),
    })

    await manager.sendMonitorPoll()

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'flint-monitor',
      })
    )
    expect(mockSendAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('report_meetings'),
      })
    )
  })

  it('sends monitor poll without error', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      onChatDelta: vi.fn(),
      onChatDone: vi.fn(),
    })
    await expect(manager.sendMonitorPoll()).resolves.toBeUndefined()
  })
})
