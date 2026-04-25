import { describe, it, expect } from 'vitest'
import { buildSuggestions, STATIC_SUGGESTIONS } from '../suggestions'
import type { AttentionItem } from '../../../../main/types'

function makeItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: '1',
    icon: 'calendar',
    title: 'Test Meeting',
    description: 'With Sarah Chen',
    metadata: {},
    ...overrides,
  }
}

describe('buildSuggestions', () => {
  it('returns static defaults when no items', () => {
    const result = buildSuggestions([])
    expect(result).toHaveLength(4)
    expect(result.map((s) => s.title)).toEqual(STATIC_SUGGESTIONS.map((s) => s.title))
  })

  it('maps calendar item to "Prepare me for" suggestion', () => {
    const result = buildSuggestions([makeItem({ icon: 'calendar', title: 'Sprint Planning' })])
    expect(result[0].title).toBe('Prepare me for Sprint Planning')
    expect(result[0].icon).toBe('calendar')
  })

  it('fills remaining slots with static defaults after contextual', () => {
    const result = buildSuggestions([makeItem({ icon: 'calendar', title: 'Sprint Planning' })])
    expect(result).toHaveLength(4)
    // First is contextual, rest are static (meeting-prep skipped due to dedup)
    expect(result[0].title).toBe('Prepare me for Sprint Planning')
  })

  it('maps mail item to "Summarize email from" suggestion', () => {
    const result = buildSuggestions([
      makeItem({ icon: 'mail', title: 'Budget Report', description: 'Sarah Chen' }),
    ])
    expect(result[0].title).toBe('Summarize email from Sarah Chen')
    expect(result[0].icon).toBe('mail')
    expect(result[0].description).toBe('Budget Report')
  })

  it('maps message-circle item to "Catch up on" suggestion', () => {
    const result = buildSuggestions([
      makeItem({ icon: 'message-circle', title: 'Engineering Channel' }),
    ])
    expect(result[0].title).toBe('Catch up on Engineering Channel')
    expect(result[0].icon).toBe('message-circle')
  })

  it('skips unmapped icon types', () => {
    const result = buildSuggestions([makeItem({ icon: 'file-text', title: 'Doc' })])
    expect(result).toHaveLength(4)
    expect(result.map((s) => s.title)).toEqual(STATIC_SUGGESTIONS.map((s) => s.title))
  })

  it('skips alert-triangle icon type', () => {
    const result = buildSuggestions([makeItem({ icon: 'alert-triangle', title: 'Warning' })])
    expect(result).toHaveLength(4)
    expect(result.map((s) => s.title)).toEqual(STATIC_SUGGESTIONS.map((s) => s.title))
  })

  it('caps contextual at 3 and adds 1 static', () => {
    const items = [
      makeItem({ id: '1', icon: 'calendar', title: 'Meeting A' }),
      makeItem({ id: '2', icon: 'mail', title: 'Email B', description: 'Mike' }),
      makeItem({ id: '3', icon: 'message-circle', title: 'Channel C' }),
      makeItem({ id: '4', icon: 'calendar', title: 'Meeting D' }),
    ]
    const result = buildSuggestions(items)
    expect(result).toHaveLength(4)
    expect(result[0].title).toBe('Prepare me for Meeting A')
    expect(result[1].title).toBe('Summarize email from Mike')
    expect(result[2].title).toBe('Catch up on Channel C')
    // 4th item is a static filler (meeting-prep covered, so it's skipped)
    expect(result[3].category).not.toBe('meeting-prep')
  })

  it('uses category dedup — contextual calendar replaces static meeting-prep', () => {
    const items = [makeItem({ icon: 'calendar', title: 'Sprint Planning' })]
    const result = buildSuggestions(items)
    // Static "Prepare me for my next meeting" (category: meeting-prep) should be skipped
    expect(result.find((s) => s.title === 'Prepare me for my next meeting')).toBeUndefined()
    // But other statics fill remaining slots
    expect(result).toHaveLength(4)
  })

  it('always returns 3-4 cards', () => {
    // 0 contextual → 4 static
    expect(buildSuggestions([])).toHaveLength(4)

    // 1 contextual → 1 + 3 static (with dedup)
    const one = buildSuggestions([makeItem()])
    expect(one.length).toBeGreaterThanOrEqual(3)
    expect(one.length).toBeLessThanOrEqual(4)

    // 3 contextual → 3 + 1 static
    const three = buildSuggestions([
      makeItem({ id: '1', icon: 'calendar', title: 'A' }),
      makeItem({ id: '2', icon: 'mail', title: 'B', description: 'X' }),
      makeItem({ id: '3', icon: 'message-circle', title: 'C' }),
    ])
    expect(three).toHaveLength(4)
  })
})
