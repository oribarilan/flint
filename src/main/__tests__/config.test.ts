import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("electron-store", () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown> = {};
      get(key: string, defaultValue?: unknown): unknown {
        return this.data[key] ?? defaultValue;
      }
      set(keyOrObj: string | Record<string, unknown>, value?: unknown): void {
        if (typeof keyOrObj === "string") {
          this.data[keyOrObj] = value;
        } else {
          Object.assign(this.data, keyOrObj);
        }
      }
      delete(key: string): void {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.data[key];
      }
    },
  };
});

import { createConfigStore } from "../config";
import { DEFAULT_CONFIG } from "../types";

describe("ConfigStore", () => {
  let store: ReturnType<typeof createConfigStore>;

  beforeEach(() => {
    store = createConfigStore();
  });

  it("returns default config when empty", () => {
    expect(store.getAll()).toEqual(DEFAULT_CONFIG);
  });

  it("updates a single setting", () => {
    store.update({ alertMinutes: 10 });
    expect(store.getAll().alertMinutes).toBe(10);
  });

  it("preserves other settings on partial update", () => {
    store.update({ alertMinutes: 10 });
    const config = store.getAll();
    expect(config.hotkey).toBe(DEFAULT_CONFIG.hotkey);
    expect(config.launchAtLogin).toBe(DEFAULT_CONFIG.launchAtLogin);
  });

  it("does not expose the removed poll fields", () => {
    const config = store.getAll();
    expect("pollEnabled" in config).toBe(false);
    expect("pollFrequency" in config).toBe(false);
    expect("pollModel" in config).toBe(false);
  });

  it("returns default fontSize as medium", () => {
    expect(store.getAll().fontSize).toBe("medium");
  });

  it("updates fontSize", () => {
    store.update({ fontSize: "large" });
    expect(store.getAll().fontSize).toBe("large");
  });

  it("falls back to default for invalid fontSize", () => {
    store.update({ fontSize: "invalid" as never });
    expect(store.getAll().fontSize).toBe("medium");
  });

  it("preserves fontSize when updating other fields", () => {
    store.update({ fontSize: "small" });
    store.update({ alertMinutes: 15 });
    const config = store.getAll();
    expect(config.fontSize).toBe("small");
    expect(config.alertMinutes).toBe(15);
  });
});
