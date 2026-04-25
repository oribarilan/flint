import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CopilotClient, CopilotSession } from '@github/copilot-sdk'

const mockSendAndWait = vi.fn().mockResolvedValue(undefined)
const mockAbort = vi.fn().mockResolvedValue(undefined)
type EventHandler = (...args: unknown[]) => void
const eventHandlers = new Map<string, EventHandler>()
const mockOn = vi.fn((event: string, handler: EventHandler) => {
  eventHandlers.set(event, handler)
})
const mockCreateSession = vi.fn().mockImplementation(async () => {
  eventHandlers.clear()
  return {
    sendAndWait: mockSendAndWait,
    on: mockOn,
    abort: mockAbort,
    sessionId: 'flint-main',
  } as unknown as CopilotSession
})

vi.mock('@github/copilot-sdk', () => ({
  approveAll: vi.fn(),
}))

vi.mock('../copilot/system-prompt', () => ({
  CHAT_SYSTEM_PROMPT: 'You are Flint, a test assistant.',
}))

vi.mock('../pulse/prompts', () => ({
  buildMonitorPrompt: vi.fn((ctx: { lastPollTime?: string }) =>
    ctx.lastPollTime ? `Last check: ${ctx.lastPollTime}` : 'Check my calendar',
  ),
  MONITOR_SYSTEM_PROMPT: 'You are the background monitor.',
}))

import { createSessionManager } from '../copilot/sessions'

function createMockClient(): CopilotClient {
  return {
    createSession: mockCreateSession,
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as CopilotClient
}

function defaultConfig() {
  return {
    getModel: () => 'gpt-4.1',
    getPollModel: () => 'gpt-4.1-mini',
    onChatDelta: vi.fn(),
    onChatDone: vi.fn(),
  }
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
  })

  it('sends chat message and creates session lazily', async () => {
    const onChatDelta = vi.fn()
    const onChatDone = vi.fn()
    const client = createMockClient()

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatDelta,
      onChatDone,
    })

    await manager.sendChatMessage('hello')

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'flint-main',
        streaming: true,
        systemMessage: {
          content: 'You are Flint, a test assistant.',
        },
      }),
    )
    expect(mockSendAndWait).toHaveBeenCalledWith({ prompt: 'hello' }, expect.any(Number))
    expect(mockOn).toHaveBeenCalledWith('session.idle', expect.any(Function))
    // Simulate the idle event firing
    eventHandlers.get('session.idle')?.()
    expect(onChatDone).toHaveBeenCalled()
  })

  it('uses getModel to read model dynamically', async () => {
    let currentModel = 'gpt-4.1'
    const client = createMockClient()

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      getModel: () => currentModel,
    })

    await manager.sendChatMessage('first')

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4.1',
      }),
    )

    // Change model — won't affect existing session
    currentModel = 'claude-sonnet-4'

    // Reset and create new session
    await manager.resetChat()
    mockCreateSession.mockClear()

    await manager.sendChatMessage('second')

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4',
      }),
    )
  })

  it('reuses existing chat session on subsequent calls', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
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
      ...defaultConfig(),
      onChatDelta,
    })

    await manager.sendChatMessage('test')

    expect(mockOn).toHaveBeenCalledWith('assistant.message_delta', expect.any(Function))
  })

  it('resetChat aborts and nulls the session', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })

    await manager.sendChatMessage('hello')
    expect(manager.getChatSession()).not.toBeNull()

    await manager.resetChat()
    expect(mockAbort).toHaveBeenCalled()
    expect(manager.getChatSession()).toBeNull()
  })

  it('resetChat is safe when no session exists', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })

    await expect(manager.resetChat()).resolves.toBeUndefined()
  })

  it('creates fresh session after resetChat', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })

    await manager.sendChatMessage('first')
    expect(mockCreateSession).toHaveBeenCalledTimes(1)

    await manager.resetChat()
    await manager.sendChatMessage('second')
    expect(mockCreateSession).toHaveBeenCalledTimes(2)
  })

  it('calls onChatError on send failure', async () => {
    const onChatError = vi.fn()
    const client = createMockClient()
    mockCreateSession.mockRejectedValueOnce(new Error('session creation failed'))

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatError,
    })

    await manager.sendChatMessage('fail')
    expect(onChatError).toHaveBeenCalledWith('Chat error: session creation failed')
  })

  it('reports timeout errors distinctly', async () => {
    const onChatError = vi.fn()
    const client = createMockClient()
    mockSendAndWait.mockRejectedValueOnce(new Error('Request timeout'))

    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      onChatError,
    })

    await manager.sendChatMessage('slow')
    expect(onChatError).toHaveBeenCalledWith('Response timed out. Try again.')
  })

  it('sends monitor poll with bootstrap prompt', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })

    await manager.sendMonitorPoll({ currentItems: [] })

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'flint-monitor',
        model: 'gpt-4.1-mini',
        systemMessage: {
          content: 'You are the background monitor.',
        },
      }),
    )
    expect(mockSendAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Check my calendar',
      }),
      expect.any(Number),
    )
  })

  it('sends monitor poll with delta prompt when lastPollTime is provided', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })

    await manager.sendMonitorPoll({
      lastPollTime: '2026-04-25T10:00:00Z',
      currentItems: [
        {
          id: 'mtg-1',
          icon: 'calendar',
          title: 'Standup',
          description: 'Daily standup',
          metadata: {},
        },
      ],
    })

    expect(mockSendAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Last check: 2026-04-25T10:00:00Z',
      }),
      expect.any(Number),
    )
  })

  it('sends monitor poll without error', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })
    await expect(
      manager.sendMonitorPoll({ currentItems: [] }),
    ).resolves.toBeUndefined()
  })

  it('monitor session uses getPollModel not getModel', async () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
      getModel: () => 'gpt-4.1',
      getPollModel: () => 'claude-sonnet-4',
    })

    await manager.sendMonitorPoll({ currentItems: [] })

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'flint-monitor',
        model: 'claude-sonnet-4',
      }),
    )
  })

  it('getChatSession returns null before first message', () => {
    const client = createMockClient()
    const manager = createSessionManager({
      client,
      ...defaultConfig(),
    })
    expect(manager.getChatSession()).toBeNull()
  })
})
