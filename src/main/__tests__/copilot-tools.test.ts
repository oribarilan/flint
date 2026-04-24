import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  shell: { openExternal: vi.fn() },
}))

vi.mock('@github/copilot-sdk', () => ({
  defineTool: (name: string, config: Record<string, unknown>) => ({
    name,
    ...config,
  }),
}))

import { createAllTools, getMonitorTools, getChatTools } from '../copilot/tools'

// Minimal mock invocation for SDK tool handler calls
const mockInvocation = {
  sessionId: 'test',
  toolCallId: 'tc-1',
  toolName: '',
  arguments: {},
} as any

describe('Copilot Tools', () => {
  it('creates 6 tools total', () => {
    const tools = createAllTools({
      onMeetings: vi.fn(),
      onShowOverlay: vi.fn(),
      onAttentionUpdate: vi.fn(),
    })
    expect(tools).toHaveLength(6)
    expect(tools.map((t) => t.name)).toEqual([
      'report_meetings',
      'get_meetings',
      'show_notification',
      'join_meeting',
      'show_overlay',
      'set_attention_items',
    ])
  })

  it('report_meetings calls onMeetings callback', async () => {
    const onMeetings = vi.fn()
    const tools = createAllTools({ onMeetings, onShowOverlay: vi.fn(), onAttentionUpdate: vi.fn() })
    const report = tools.find((t) => t.name === 'report_meetings')!
    const meeting = {
      id: '1',
      title: 'Test',
      startTime: '',
      endTime: '',
      attendees: [],
      organizer: '',
    }
    await report.handler({ meetings: [meeting] }, mockInvocation)
    expect(onMeetings).toHaveBeenCalledWith([meeting])
  })

  it('get_meetings returns from getter', async () => {
    const meetings = [
      { id: '2', title: 'Retro', startTime: '', endTime: '', attendees: [], organizer: '' },
    ]
    const tools = createAllTools({
      onMeetings: vi.fn(),
      onShowOverlay: vi.fn(),
      onAttentionUpdate: vi.fn(),
      getMeetings: () => meetings,
    })
    const get = tools.find((t) => t.name === 'get_meetings')!
    expect(await get.handler({}, mockInvocation)).toEqual(meetings)
  })

  it('get_meetings returns empty array when no getter', async () => {
    const tools = createAllTools({
      onMeetings: vi.fn(),
      onShowOverlay: vi.fn(),
      onAttentionUpdate: vi.fn(),
    })
    const get = tools.find((t) => t.name === 'get_meetings')!
    expect(await get.handler({}, mockInvocation)).toEqual([])
  })

  it('show_overlay calls onShowOverlay callback', async () => {
    const onShowOverlay = vi.fn()
    const tools = createAllTools({ onMeetings: vi.fn(), onShowOverlay, onAttentionUpdate: vi.fn() })
    const overlay = tools.find((t) => t.name === 'show_overlay')!
    await overlay.handler({ meetingId: 'abc' }, mockInvocation)
    expect(onShowOverlay).toHaveBeenCalledWith('abc')
  })

  it('getMonitorTools returns only report_meetings', () => {
    const tools = getMonitorTools({ onMeetings: vi.fn() })
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('report_meetings')
  })

  it('getChatTools returns everything except report_meetings', () => {
    const tools = getChatTools({ onShowOverlay: vi.fn(), onAttentionUpdate: vi.fn() })
    expect(tools).toHaveLength(5)
    expect(tools.map((t) => t.name)).not.toContain('report_meetings')
  })
})
