import { describe, it, expect, beforeEach } from 'vitest'
import { createMeetingCache } from '../meetings/cache'
import type { Meeting } from '../types'

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: '1',
    title: 'Test Meeting',
    startTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    endTime: new Date(Date.now() + 90 * 60_000).toISOString(),
    attendees: ['Alice', 'Bob'],
    organizer: 'Alice',
    ...overrides,
  }
}

describe('MeetingCache', () => {
  let cache: ReturnType<typeof createMeetingCache>

  beforeEach(() => {
    cache = createMeetingCache()
  })

  it('starts empty in loading state', () => {
    expect(cache.getAll()).toEqual([])
    expect(cache.getStatus()).toBe('loading')
  })

  it('replaces all meetings on update', () => {
    cache.update([makeMeeting({ id: '1' }), makeMeeting({ id: '2' })])
    expect(cache.getAll()).toHaveLength(2)
    expect(cache.getStatus()).toBe('ready')
  })

  it('returns meetings needing alert within threshold', () => {
    const soon = makeMeeting({
      id: 'soon',
      startTime: new Date(Date.now() + 3 * 60_000).toISOString(),
    })
    const later = makeMeeting({
      id: 'later',
      startTime: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    cache.update([soon, later])
    const needAlert = cache.getMeetingsNeedingAlert(5)
    expect(needAlert).toHaveLength(1)
    expect(needAlert[0].id).toBe('soon')
  })

  it('marks a meeting as alerted', () => {
    cache.update([makeMeeting({ id: 'alert-me' })])
    cache.markAlerted('alert-me')
    expect(cache.getMeetingsNeedingAlert(60)).toHaveLength(0)
  })

  it('removes past meetings on prune', () => {
    const past = makeMeeting({
      id: 'past',
      startTime: new Date(Date.now() - 60 * 60_000).toISOString(),
      endTime: new Date(Date.now() - 30 * 60_000).toISOString(),
    })
    cache.update([past, makeMeeting({ id: 'future' })])
    cache.prune()
    expect(cache.getAll()).toHaveLength(1)
    expect(cache.getAll()[0].id).toBe('future')
  })

  it('sets error status but keeps stale data', () => {
    cache.update([makeMeeting()])
    cache.setError()
    expect(cache.getStatus()).toBe('error')
    expect(cache.getAll()).toHaveLength(1)
  })

  it('preserves alerted state across updates', () => {
    cache.update([
      makeMeeting({
        id: 'keep-alert',
        startTime: new Date(Date.now() + 3 * 60_000).toISOString(),
      }),
    ])
    cache.markAlerted('keep-alert')
    cache.update([
      makeMeeting({
        id: 'keep-alert',
        startTime: new Date(Date.now() + 3 * 60_000).toISOString(),
      }),
    ])
    expect(cache.getMeetingsNeedingAlert(60)).toHaveLength(0)
  })

  it('returns correct count', () => {
    expect(cache.getCount()).toBe(0)
    cache.update([makeMeeting({ id: '1' }), makeMeeting({ id: '2' })])
    expect(cache.getCount()).toBe(2)
  })

  it('does not include alerted flag in getAll results', () => {
    cache.update([makeMeeting({ id: '1' })])
    const meetings = cache.getAll()
    expect(meetings[0]).not.toHaveProperty('alerted')
  })
})
