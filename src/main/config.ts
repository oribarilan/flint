import Store from 'electron-store'
import type { FlintConfig } from './types'
import { DEFAULT_CONFIG } from './types'

export interface ConfigStore {
  getAll(): FlintConfig
  update(partial: Partial<FlintConfig>): void
}

export function createConfigStore(): ConfigStore {
  const store = new Store<FlintConfig>({
    defaults: DEFAULT_CONFIG,
  })

  return {
    getAll(): FlintConfig {
      return {
        hotkey: store.get('hotkey', DEFAULT_CONFIG.hotkey) as string,
        alertMinutes: store.get('alertMinutes', DEFAULT_CONFIG.alertMinutes) as number,
        launchAtLogin: store.get('launchAtLogin', DEFAULT_CONFIG.launchAtLogin) as boolean,
        showTrayIcon: store.get('showTrayIcon', DEFAULT_CONFIG.showTrayIcon) as boolean,
      }
    },

    update(partial: Partial<FlintConfig>): void {
      for (const [key, value] of Object.entries(partial)) {
        if (value !== undefined) {
          store.set(key as keyof FlintConfig, value as FlintConfig[keyof FlintConfig])
        }
      }
    },
  }
}
