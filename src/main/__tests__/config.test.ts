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
})
