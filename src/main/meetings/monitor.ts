import { powerMonitor } from 'electron'
import { createMeetingCache, type MeetingCache } from './cache'
import { fireNotification } from './notifications'
import type { Meeting } from '../types'
import type { SessionManager } from '../copilot/sessions'

const POLL_INTERVAL_MS = 15 * 60_000
const TICK_INTERVAL_MS = 60_000

interface MonitorConfig {
  sessionManager: SessionManager
  getAlertMinutes: () => number
  onMeetingsChanged: (meetings: Meeting[]) => void
  onShowOverlay: (meetingId: string) => void
  onBadgeUpdate: (count: number) => void
}

export interface MeetingMonitor {
  start(): void
  stop(): void
  getCache(): MeetingCache
  pollNow(): Promise<void>
}

export function createMeetingMonitor(config: MonitorConfig): MeetingMonitor {
  const cache = createMeetingCache()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let suspended = false

  async function poll(): Promise<void> {
    try {
      await config.sessionManager.sendMonitorPoll()
    } catch (err) {
      console.error('[monitor] Poll failed:', err)
      cache.setError()
    }
    config.onBadgeUpdate(cache.getCount())
    config.onMeetingsChanged(cache.getAll())
  }

  function tick(): void {
    if (suspended) return
    cache.prune()
    const alertMinutes = config.getAlertMinutes()
    const needAlert = cache.getMeetingsNeedingAlert(alertMinutes)
    for (const meeting of needAlert) {
      fireNotification(meeting, config.onShowOverlay)
      cache.markAlerted(meeting.id)
    }
    config.onMeetingsChanged(cache.getAll())
    config.onBadgeUpdate(cache.getCount())
  }

  function onResume(): void {
    suspended = false
    console.log('[monitor] System resumed, re-polling')
    poll()
  }

  function onSuspend(): void {
    suspended = true
    console.log('[monitor] System suspending')
  }

  return {
    start(): void {
      poll()
      pollTimer = setInterval(poll, POLL_INTERVAL_MS)
      tickTimer = setInterval(tick, TICK_INTERVAL_MS)
      powerMonitor.on('resume', onResume)
      powerMonitor.on('suspend', onSuspend)
    },

    stop(): void {
      if (pollTimer) clearInterval(pollTimer)
      if (tickTimer) clearInterval(tickTimer)
      pollTimer = null
      tickTimer = null
      powerMonitor.removeListener('resume', onResume)
      powerMonitor.removeListener('suspend', onSuspend)
    },

    getCache(): MeetingCache {
      return cache
    },

    async pollNow(): Promise<void> {
      await poll()
    },
  }
}
