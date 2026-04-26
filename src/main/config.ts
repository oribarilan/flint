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
    migrations: {
      '0.2.0': (s) => {
        if (s.get('pollEnabled') === undefined) {
          s.set('pollEnabled', DEFAULT_CONFIG.pollEnabled)
        }
        if (s.get('pollFrequency') === undefined) {
          s.set('pollFrequency', DEFAULT_CONFIG.pollFrequency)
        }
        if (s.get('pollModel') === undefined) {
          s.set('pollModel', DEFAULT_CONFIG.pollModel)
        }
      },
      '0.3.0': (s) => {
        if (s.get('fontSize') === undefined) {
          s.set('fontSize', DEFAULT_CONFIG.fontSize)
        }
      },
      '0.4.0': (s) => {
        if (s.get('theme') === undefined) {
          s.set('theme', DEFAULT_CONFIG.theme)
        }
      },
    },
  })

  const VALID_FONT_SIZES = new Set(['extra-small', 'small', 'medium', 'large'])
  const VALID_THEMES = new Set(['dark', 'light', 'system'])

  return {
    getAll(): FlintConfig {
      const rawFontSize = store.get('fontSize', DEFAULT_CONFIG.fontSize) as string
      return {
        hotkey: store.get('hotkey', DEFAULT_CONFIG.hotkey) as string,
        alertMinutes: store.get('alertMinutes', DEFAULT_CONFIG.alertMinutes) as number,
        launchAtLogin: store.get('launchAtLogin', DEFAULT_CONFIG.launchAtLogin) as boolean,
        showTrayIcon: store.get('showTrayIcon', DEFAULT_CONFIG.showTrayIcon) as boolean,
        model: store.get('model', DEFAULT_CONFIG.model) as string,
        pollEnabled: store.get('pollEnabled', DEFAULT_CONFIG.pollEnabled) as boolean,
        pollFrequency: store.get('pollFrequency', DEFAULT_CONFIG.pollFrequency) as FlintConfig['pollFrequency'],
        pollModel: store.get('pollModel', DEFAULT_CONFIG.pollModel) as string,
        fontSize: (VALID_FONT_SIZES.has(rawFontSize) ? rawFontSize : DEFAULT_CONFIG.fontSize) as FlintConfig['fontSize'],
        theme: (() => {
          const rawTheme = store.get('theme', DEFAULT_CONFIG.theme) as string
          return (VALID_THEMES.has(rawTheme) ? rawTheme : DEFAULT_CONFIG.theme) as FlintConfig['theme']
        })(),
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
