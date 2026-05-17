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
      // V1 scope decision (2026-04-30): the LLM monitor session is removed.
      // Strip the now-defunct keys silently so older config files don't carry stale state.
      "0.5.0": (s) => {
        const untyped = s as unknown as { delete: (key: string) => void };
        for (const key of ["pollEnabled", "pollFrequency", "pollModel"]) {
          untyped.delete(key);
        }
      },
      "0.6.0": (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety
        if (s.get("menubarEnabled") === undefined) {
          s.set("menubarEnabled", DEFAULT_CONFIG.menubarEnabled);
          s.set("menubarTime", DEFAULT_CONFIG.menubarTime);
          s.set("menubarTitle", DEFAULT_CONFIG.menubarTitle);
        }
      },
      "0.7.0": (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- migration safety
        if (s.get("spotlightEnabled") === undefined) {
          s.set("spotlightEnabled", DEFAULT_CONFIG.spotlightEnabled);
          s.set("spotlightMinutes", DEFAULT_CONFIG.spotlightMinutes);
        }
      },
    },
  });

  const VALID_FONT_SIZES = new Set(["extra-small", "small", "medium", "large"]);
  const VALID_THEMES = new Set(["dark", "light", "system"]);
  const VALID_MENUBAR_TIMES = new Set(["off", "next-time", "countdown"]);

  return {
    getAll(): FlintConfig {
      const rawFontSize = store.get("fontSize", DEFAULT_CONFIG.fontSize);
      return {
        hotkey: store.get("hotkey", DEFAULT_CONFIG.hotkey),
        alertMinutes: store.get("alertMinutes", DEFAULT_CONFIG.alertMinutes),
        launchAtLogin: store.get("launchAtLogin", DEFAULT_CONFIG.launchAtLogin),
        showTrayIcon: store.get("showTrayIcon", DEFAULT_CONFIG.showTrayIcon),
        model: store.get("model", DEFAULT_CONFIG.model),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation against corrupt data
        fontSize: VALID_FONT_SIZES.has(rawFontSize) ? rawFontSize : DEFAULT_CONFIG.fontSize,
        theme: (() => {
          const rawTheme = store.get("theme", DEFAULT_CONFIG.theme);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation against corrupt data
          return VALID_THEMES.has(rawTheme) ? rawTheme : DEFAULT_CONFIG.theme;
        })(),
        menubarEnabled: store.get("menubarEnabled", DEFAULT_CONFIG.menubarEnabled),
        menubarTime: (() => {
          const raw = store.get("menubarTime", DEFAULT_CONFIG.menubarTime);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime validation against corrupt data
          return VALID_MENUBAR_TIMES.has(raw) ? raw : DEFAULT_CONFIG.menubarTime;
        })(),
        menubarTitle: store.get("menubarTitle", DEFAULT_CONFIG.menubarTitle),
        spotlightEnabled: store.get("spotlightEnabled", DEFAULT_CONFIG.spotlightEnabled),
        spotlightMinutes: store.get("spotlightMinutes", DEFAULT_CONFIG.spotlightMinutes),
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
