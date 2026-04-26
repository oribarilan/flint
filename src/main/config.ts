import Store from "electron-store";
import type { FlintConfig } from "./types";
import { DEFAULT_CONFIG } from "./types";

export interface ConfigStore {
  getAll(): FlintConfig;
  update(partial: Partial<FlintConfig>): void;
}

export function createConfigStore(): ConfigStore {
  const store = new Store<FlintConfig>({
    defaults: DEFAULT_CONFIG,
    migrations: {
      "0.2.0": (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety: key may not exist in older versions
        if (s.get("pollEnabled") === undefined) {
          s.set("pollEnabled", DEFAULT_CONFIG.pollEnabled);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety: key may not exist in older versions
        if (s.get("pollFrequency") === undefined) {
          s.set("pollFrequency", DEFAULT_CONFIG.pollFrequency);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety: key may not exist in older versions
        if (s.get("pollModel") === undefined) {
          s.set("pollModel", DEFAULT_CONFIG.pollModel);
        }
      },
      "0.3.0": (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety: key may not exist in older versions
        if (s.get("fontSize") === undefined) {
          s.set("fontSize", DEFAULT_CONFIG.fontSize);
        }
      },
      "0.4.0": (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety: key may not exist in older versions
        if (s.get("theme") === undefined) {
          s.set("theme", DEFAULT_CONFIG.theme);
        }
      },
    },
  });

  const VALID_FONT_SIZES = new Set(["extra-small", "small", "medium", "large"]);
  const VALID_THEMES = new Set(["dark", "light", "system"]);

  return {
    getAll(): FlintConfig {
      const rawFontSize = store.get("fontSize", DEFAULT_CONFIG.fontSize);
      return {
        hotkey: store.get("hotkey", DEFAULT_CONFIG.hotkey),
        alertMinutes: store.get("alertMinutes", DEFAULT_CONFIG.alertMinutes),
        launchAtLogin: store.get("launchAtLogin", DEFAULT_CONFIG.launchAtLogin),
        showTrayIcon: store.get("showTrayIcon", DEFAULT_CONFIG.showTrayIcon),
        model: store.get("model", DEFAULT_CONFIG.model),
        pollEnabled: store.get("pollEnabled", DEFAULT_CONFIG.pollEnabled),
        pollFrequency: store.get("pollFrequency", DEFAULT_CONFIG.pollFrequency),
        pollModel: store.get("pollModel", DEFAULT_CONFIG.pollModel),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation against corrupt data
        fontSize: VALID_FONT_SIZES.has(rawFontSize) ? rawFontSize : DEFAULT_CONFIG.fontSize,
        theme: (() => {
          const rawTheme = store.get("theme", DEFAULT_CONFIG.theme);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation against corrupt data
          return VALID_THEMES.has(rawTheme) ? rawTheme : DEFAULT_CONFIG.theme;
        })(),
      };
    },

    update(partial: Partial<FlintConfig>): void {
      for (const [key, value] of Object.entries(partial)) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Partial<T> values may be undefined at runtime
        if (value !== undefined) {
          store.set(key as keyof FlintConfig, value);
        }
      }
    },
  };
}
