import { describe, it, expect } from 'vitest'
import { buildMonitorPrompt, MONITOR_SYSTEM_PROMPT } from '../pulse/prompts'
import type { AttentionItem } from '../types'

function makeItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: 'item-1',
    icon: 'calendar',
    title: 'Standup',
    description: 'Daily standup in 10 minutes',
    metadata: {},
    ...overrides,
  }
}

describe('buildMonitorPrompt', () => {
  it('returns bootstrap prompt when lastPollTime is undefined', () => {
    const prompt = buildMonitorPrompt({ currentItems: [] })

    expect(prompt).toContain('calendar')
    expect(prompt).toContain('emails')
    expect(prompt).toContain('Teams')
    expect(prompt).not.toContain('Last check')
  })

  it('returns delta prompt with timestamp and serialized items', () => {
    const items = [
      makeItem({ id: 'mtg-1', icon: 'calendar', title: 'Standup' }),
      makeItem({ id: 'msg-2', icon: 'mail', title: 'Urgent from VP' }),
    ]
    const prompt = buildMonitorPrompt({
      lastPollTime: '2026-04-25T10:00:00Z',
      currentItems: items,
    })

    expect(prompt).toContain('Last check: 2026-04-25T10:00:00Z')
    expect(prompt).toContain('"id":"mtg-1"')
    expect(prompt).toContain('"id":"msg-2"')
    expect(prompt).toContain('"title":"Standup"')
    expect(prompt).toContain('"title":"Urgent from VP"')
    expect(prompt).toContain('Update items')
  })

  it('serializes empty items as "none"', () => {
    const prompt = buildMonitorPrompt({
      lastPollTime: '2026-04-25T10:00:00Z',
      currentItems: [],
    })

    expect(prompt).toContain('Last check: 2026-04-25T10:00:00Z')
    expect(prompt).toContain('Current items: none')
  })
})

describe('MONITOR_SYSTEM_PROMPT', () => {
  it('includes tool descriptions', () => {
    expect(MONITOR_SYSTEM_PROMPT).toContain('ask_work_iq')
    expect(MONITOR_SYSTEM_PROMPT).toContain('set_attention_items')
    expect(MONITOR_SYSTEM_PROMPT).toContain('show_notification')
  })

  it('includes notification guidelines', () => {
    expect(MONITOR_SYSTEM_PROMPT).toContain('time-sensitive')
    expect(MONITOR_SYSTEM_PROMPT).toContain('5-8 max')
  })
})
