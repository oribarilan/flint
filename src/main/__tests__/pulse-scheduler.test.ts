import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isWorkHours,
  getIntervalMs,
  createPulseScheduler,
  BASE_INTERVALS,
  OFF_HOURS_MULTIPLIER,
} from '../pulse/scheduler'
import type { PulseSchedulerConfig } from '../pulse/scheduler'
import type { FlintConfig } from '../types'

// Mock electron
vi.mock('electron', () => ({
  powerMonitor: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

/** Flush microtasks so async poll() continuations resolve after timer advancement. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createMockConfig(
  overrides: Partial<FlintConfig> = {},
): FlintConfig {
  return {
    hotkey: 'Ctrl+Shift+Space',
    alertMinutes: 5,
    launchAtLogin: true,
    showTrayIcon: true,
    model: 'gpt-4.1',
    pollEnabled: true,
    pollFrequency: 'normal',
    pollModel: 'gpt-4.1-mini',
    fontSize: 'medium',
    ...overrides,
  }
}

function createMockDeps(configOverrides: Partial<FlintConfig> = {}): {
  config: PulseSchedulerConfig
  mocks: {
    sendMonitorPoll: ReturnType<typeof vi.fn>
    getStatus: ReturnType<typeof vi.fn>
    onStatusChange: ReturnType<typeof vi.fn>
    getAll: ReturnType<typeof vi.fn>
    getConfig: ReturnType<typeof vi.fn>
    onOverlayFocus: ReturnType<typeof vi.fn>
    onOverlayBlur: ReturnType<typeof vi.fn>
  }
} {
  const flintConfig = createMockConfig(configOverrides)

  const mocks = {
    sendMonitorPoll: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue('connected'),
    onStatusChange: vi.fn((_cb: (status: string) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      return (): void => {}
    }),
    getAll: vi.fn().mockReturnValue([]),
    getConfig: vi.fn().mockReturnValue(flintConfig),
    onOverlayFocus: vi.fn(),
    onOverlayBlur: vi.fn(),
  }

  const config: PulseSchedulerConfig = {
    sessionManager: {
      sendMonitorPoll: mocks.sendMonitorPoll,
      sendChatMessage: vi.fn(),
      resetChat: vi.fn(),
      getChatSession: vi.fn().mockReturnValue(null),
    },
    copilotManager: {
      start: vi.fn(),
      stop: vi.fn(),
      getClient: vi.fn().mockReturnValue(null),
      getStatus: mocks.getStatus,
      onStatusChange: mocks.onStatusChange,
    },
    attentionStore: {
      getAll: mocks.getAll,
      setItems: vi.fn(),
      findById: vi.fn(),
    },
    getConfig: mocks.getConfig,
    onOverlayFocus: mocks.onOverlayFocus,
    onOverlayBlur: mocks.onOverlayBlur,
  }

  return { config, mocks }
}

describe('isWorkHours', () => {
  it('returns true for weekday at 9am', () => {
    // Monday 9:00
    const date = new Date(2026, 3, 20, 9, 0) // April 20, 2026 is Monday
    expect(isWorkHours(date)).toBe(true)
  })

  it('returns true for weekday at 4pm (16:00)', () => {
    // Wednesday 16:30
    const date = new Date(2026, 3, 22, 16, 30) // Wednesday
    expect(isWorkHours(date)).toBe(true)
  })

  it('returns false for weekday before 9am', () => {
    const date = new Date(2026, 3, 20, 8, 59) // Monday 8:59
    expect(isWorkHours(date)).toBe(false)
  })

  it('returns false for weekday at 5pm (17:00)', () => {
    const date = new Date(2026, 3, 20, 17, 0) // Monday 17:00
    expect(isWorkHours(date)).toBe(false)
  })

  it('returns false for Saturday', () => {
    const date = new Date(2026, 3, 25, 12, 0) // Saturday noon
    expect(isWorkHours(date)).toBe(false)
  })

  it('returns false for Sunday', () => {
    const date = new Date(2026, 3, 26, 12, 0) // Sunday noon
    expect(isWorkHours(date)).toBe(false)
  })
})

describe('getIntervalMs', () => {
  it('returns base interval during work hours', () => {
    const workDay = new Date(2026, 3, 20, 12, 0) // Monday noon
    expect(getIntervalMs('normal', workDay)).toBe(BASE_INTERVALS.normal)
    expect(getIntervalMs('relaxed', workDay)).toBe(BASE_INTERVALS.relaxed)
    expect(getIntervalMs('aggressive', workDay)).toBe(BASE_INTERVALS.aggressive)
  })

  it('returns 3x interval during off-hours', () => {
    const offHours = new Date(2026, 3, 25, 12, 0) // Saturday noon
    expect(getIntervalMs('normal', offHours)).toBe(BASE_INTERVALS.normal * OFF_HOURS_MULTIPLIER)
    expect(getIntervalMs('relaxed', offHours)).toBe(BASE_INTERVALS.relaxed * OFF_HOURS_MULTIPLIER)
    expect(getIntervalMs('aggressive', offHours)).toBe(
      BASE_INTERVALS.aggressive * OFF_HOURS_MULTIPLIER,
    )
  })

  it('normal base is 10 minutes', () => {
    expect(BASE_INTERVALS.normal).toBe(10 * 60_000)
  })

  it('relaxed base is 20 minutes', () => {
    expect(BASE_INTERVALS.relaxed).toBe(20 * 60_000)
  })

  it('aggressive base is 5 minutes', () => {
    expect(BASE_INTERVALS.aggressive).toBe(5 * 60_000)
  })
})

describe('PulseScheduler', () => {
  // Pin fake clock to a known work-hours time so getIntervalMs returns base intervals.
  // Monday April 20, 2026 at 12:00 noon
  const WORK_HOURS_DATE = new Date(2026, 3, 20, 12, 0, 0)

  beforeEach(() => {
    vi.useFakeTimers({ now: WORK_HOURS_DATE })
    vi.spyOn(console, 'log').mockImplementation(/* noop */ () => undefined)
    vi.spyOn(console, 'error').mockImplementation(/* noop */ () => undefined)
    vi.spyOn(console, 'warn').mockImplementation(/* noop */ () => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fires immediate bootstrap poll on start (no lastPollTime)', async () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)
    // Bootstrap poll has no lastPollTime
    expect(mocks.sendMonitorPoll).toHaveBeenCalledWith({
      currentItems: [],
    })

    scheduler.stop()
  })

  it('subsequent poll includes lastPollTime', async () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    // Advance past the interval to trigger second poll
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)
    const secondCall = mocks.sendMonitorPoll.mock.calls[1][0] as { lastPollTime?: string; currentItems: unknown[] }
    expect(secondCall.lastPollTime).toBeDefined()
    expect(secondCall.currentItems).toEqual([])

    scheduler.stop()
  })

  it('pollNow() triggers immediate poll', async () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    scheduler.pollNow()
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('stop() prevents further polls', async () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    scheduler.stop()

    // Advance well past the interval
    vi.advanceTimersByTime(BASE_INTERVALS.normal * 5)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)
  })

  it('pollEnabled: false prevents polling on start', () => {
    const { config, mocks } = createMockDeps({ pollEnabled: false })
    const scheduler = createPulseScheduler(config)

    scheduler.start()

    expect(mocks.sendMonitorPoll).not.toHaveBeenCalled()
  })

  it('pollEnabled: false skips poll during tick', async () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    // Disable polling mid-run
    mocks.getConfig.mockReturnValue(createMockConfig({ pollEnabled: false }))

    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()

    // Should only have the bootstrap poll
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('pauses polls during overlay focus and resumes on blur', async () => {
    const { config, mocks } = createMockDeps()
    let focusCb: (() => void) | undefined
    let blurCb: (() => void) | undefined
    mocks.onOverlayFocus.mockImplementation((cb: () => void) => {
      focusCb = cb
    })
    mocks.onOverlayBlur.mockImplementation((cb: () => void) => {
      blurCb = cb
    })

    const scheduler = createPulseScheduler(config)
    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    // Simulate focus
    expect(focusCb).toBeDefined()
    if (focusCb) focusCb()

    // Advance past interval — poll should be deferred (timer fires but poll defers)
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1) // still 1

    // Simulate blur — deferred poll should fire
    expect(blurCb).toBeDefined()
    if (blurCb) blurCb()
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('poll failure is logged and next poll is scheduled', async () => {
    const { config, mocks } = createMockDeps()
    mocks.sendMonitorPoll.mockRejectedValueOnce(new Error('network error'))

    const scheduler = createPulseScheduler(config)
    scheduler.start()
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      '[pulse] Poll failed:',
      'network error',
    )

    // Next poll should still be scheduled
    mocks.sendMonitorPoll.mockResolvedValue(undefined)
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('logs warning after 3 consecutive failures', async () => {
    const { config, mocks } = createMockDeps()
    mocks.sendMonitorPoll.mockRejectedValue(new Error('fail'))

    const scheduler = createPulseScheduler(config)
    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    // Advance for 2nd poll
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)

    // Advance for 3rd poll
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(3)

    expect(console.warn).toHaveBeenCalledWith(
      '[pulse] 3 consecutive poll failures, will retry next interval',
    )

    scheduler.stop()
  })

  it('skips poll when copilot is disconnected', async () => {
    const { config, mocks } = createMockDeps()
    mocks.getStatus.mockReturnValue('disconnected')

    const scheduler = createPulseScheduler(config)
    scheduler.start()
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).not.toHaveBeenCalled()

    scheduler.stop()
  })

  it('fires pollNow on copilot reconnection', async () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    // Get the status change callback
    const statusChangeCb = mocks.onStatusChange.mock.calls[0][0] as (status: string) => void

    // Simulate reconnection
    statusChangeCb('connected')
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)

    scheduler.stop()
  })

  it('registers powerMonitor resume listener on start', async () => {
    const { powerMonitor } = await import('electron')
    const { config } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(powerMonitor.on).toHaveBeenCalledWith('resume', expect.any(Function))

    scheduler.stop()
  })

  it('removes powerMonitor listener on stop', async () => {
    const { powerMonitor } = await import('electron')
    const { config } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.start()
    scheduler.stop()

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(powerMonitor.removeListener).toHaveBeenCalledWith('resume', expect.any(Function))
  })

  it('passes current attention items to poll', async () => {
    const { config, mocks } = createMockDeps()
    const items = [
      { id: '1', icon: 'calendar', title: 'Meeting', description: 'Test', metadata: {} },
    ]
    mocks.getAll.mockReturnValue(items)

    const scheduler = createPulseScheduler(config)
    scheduler.start()
    await flushMicrotasks()

    expect(mocks.sendMonitorPoll).toHaveBeenCalledWith({
      currentItems: items,
    })

    scheduler.stop()
  })

  it('resets consecutive failure counter on success', async () => {
    const { config, mocks } = createMockDeps()

    // Fail twice, then succeed, then fail once
    mocks.sendMonitorPoll
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fail after reset'))

    const scheduler = createPulseScheduler(config)
    scheduler.start()
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(1)

    // Advance to second poll (fail 2)
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(2)

    // Advance to third poll (success — resets counter)
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(3)

    // Advance to fourth poll (fail after reset)
    vi.advanceTimersByTime(BASE_INTERVALS.normal + 100)
    await flushMicrotasks()
    expect(mocks.sendMonitorPoll).toHaveBeenCalledTimes(4)

    // Should NOT have logged the 3-consecutive warning (counter was reset)
    expect(console.warn).not.toHaveBeenCalledWith(
      '[pulse] 3 consecutive poll failures, will retry next interval',
    )

    scheduler.stop()
  })

  it('pollNow does nothing when not started', () => {
    const { config, mocks } = createMockDeps()
    const scheduler = createPulseScheduler(config)

    scheduler.pollNow()

    expect(mocks.sendMonitorPoll).not.toHaveBeenCalled()
  })
})
