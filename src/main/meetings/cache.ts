import type { Meeting } from '../types'

export type CacheStatus = 'loading' | 'ready' | 'error'

interface CachedMeeting extends Meeting {
  alerted: boolean
}

export interface MeetingCache {
  getAll(): Meeting[]
  update(meetings: Meeting[]): void
  getMeetingsNeedingAlert(alertMinutes: number): Meeting[]
  markAlerted(id: string): void
  prune(): void
  setError(): void
  getStatus(): CacheStatus
  getCount(): number
}

export function createMeetingCache(): MeetingCache {
  let meetings: CachedMeeting[] = []
  let status: CacheStatus = 'loading'

  return {
    getAll(): Meeting[] {
      return meetings.map(({ alerted: _alerted, ...m }) => m)
    },

    update(newMeetings: Meeting[]): void {
      const alertedIds = new Set(meetings.filter((m) => m.alerted).map((m) => m.id))
      meetings = newMeetings.map((m) => ({
        ...m,
        alerted: alertedIds.has(m.id),
      }))
      status = 'ready'
    },

    getMeetingsNeedingAlert(alertMinutes: number): Meeting[] {
      const now = Date.now()
      const threshold = alertMinutes * 60_000
      return meetings
        .filter((m) => {
          if (m.alerted) return false
          const timeUntil = new Date(m.startTime).getTime() - now
          return timeUntil > 0 && timeUntil <= threshold
        })
        .map(({ alerted: _alerted, ...m }) => m)
    },

    markAlerted(id: string): void {
      const meeting = meetings.find((m) => m.id === id)
      if (meeting) meeting.alerted = true
    },

    prune(): void {
      const now = Date.now()
      meetings = meetings.filter((m) => new Date(m.endTime).getTime() > now)
    },

    setError(): void {
      status = 'error'
    },

    getStatus(): CacheStatus {
      return status
    },

    getCount(): number {
      return meetings.length
    },
  }
}
