import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown> = {}
      get(key: string, defaultValue?: unknown): unknown {
        return this.data[key] ?? defaultValue
      }
      set(keyOrObj: string | Record<string, unknown>, value?: unknown): void {
        if (typeof keyOrObj === 'string') {
          this.data[keyOrObj] = value
        } else {
          Object.assign(this.data, keyOrObj)
        }
      }
    }
  }
})

import { createConfigStore } from '../config'
import { DEFAULT_CONFIG } from '../types'

describe('ConfigStore', () => {
  let store: ReturnType<typeof createConfigStore>

  beforeEach(() => {
    store = createConfigStore()
  })

  it('returns default config when empty', () => {
    expect(store.getAll()).toEqual(DEFAULT_CONFIG)
  })

  it('updates a single setting', () => {
    store.update({ alertMinutes: 10 })
    expect(store.getAll().alertMinutes).toBe(10)
  })

  it('preserves other settings on partial update', () => {
    store.update({ alertMinutes: 10 })
    const config = store.getAll()
    expect(config.hotkey).toBe(DEFAULT_CONFIG.hotkey)
    expect(config.launchAtLogin).toBe(DEFAULT_CONFIG.launchAtLogin)
  })

  it('returns default poll config fields', () => {
    const config = store.getAll()
    expect(config.pollEnabled).toBe(true)
    expect(config.pollFrequency).toBe('normal')
    expect(config.pollModel).toBe('gpt-4.1-mini')
  })

  it('updates pollFrequency', () => {
    store.update({ pollFrequency: 'aggressive' })
    expect(store.getAll().pollFrequency).toBe('aggressive')
  })

  it('updates pollEnabled', () => {
    store.update({ pollEnabled: false })
    expect(store.getAll().pollEnabled).toBe(false)
  })

  it('updates pollModel', () => {
    store.update({ pollModel: 'gpt-4.1' })
    expect(store.getAll().pollModel).toBe('gpt-4.1')
  })

  it('preserves poll settings when updating other fields', () => {
    store.update({ pollFrequency: 'relaxed', pollModel: 'gpt-4.1' })
    store.update({ alertMinutes: 15 })
    const config = store.getAll()
    expect(config.pollFrequency).toBe('relaxed')
    expect(config.pollModel).toBe('gpt-4.1')
    expect(config.alertMinutes).toBe(15)
  })
})
