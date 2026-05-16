import { ipcMain, Notification } from "electron";
import { IPC_CHANNELS } from "./channels";
import type { AttentionItem, FlintConfig } from "../types";
import { createConfigStore, type ConfigStore } from "../config";
import { createAttentionStore, type AttentionStore } from "../attention/store";
import { hideOverlay } from "../window/overlay";
import { openExternalUrl } from "../lib/url";
import { FlintConfigSchema } from "../lib/schemas";

let configStore: ConfigStore;
let attentionStore: AttentionStore;

export function getConfigStore(): ConfigStore {
  return configStore;
}

export function getAttentionStore(): AttentionStore {
  return attentionStore;
}

export function registerIpcHandlers(): void {
  configStore = createConfigStore();
  attentionStore = createAttentionStore();

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (): FlintConfig => {
    return configStore.getAll();
  });

  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, partial: unknown) => {
    if (typeof partial !== "object" || partial === null) {
      console.warn("[ipc] config:set rejected: payload is not an object");
      return;
    }
    const validated: Partial<FlintConfig> = {};
    const partialSchema = FlintConfigSchema.partial();
    // Per-key validation so a single bad field doesn't drop good ones.
    for (const [key, value] of Object.entries(partial as Record<string, unknown>)) {
      const fieldResult = partialSchema.safeParse({ [key]: value });
      if (fieldResult.success) {
        Object.assign(validated, fieldResult.data);
      } else {
        console.warn("[ipc] config:set dropped invalid field:", key, {
          issues: fieldResult.error.issues,
        });
      }
    }
    if (Object.keys(validated).length > 0) {
      configStore.update(validated);
    }
  });

  ipcMain.on(IPC_CHANNELS.OVERLAY_HIDE, () => {
    hideOverlay();
  });

  ipcMain.handle(IPC_CHANNELS.ATTENTION_GET, (): AttentionItem[] => {
    return attentionStore.getAll();
  });

  ipcMain.on(IPC_CHANNELS.ATTENTION_OPEN, (_event, id: string) => {
    const item = attentionStore.findById(id);
    if (item?.openAction?.type === "url") {
      openExternalUrl(item.openAction.url);
    }
  });

  ipcMain.on(IPC_CHANNELS.LINK_OPEN, (_event, url: string) => {
    openExternalUrl(url);
  });

  ipcMain.on(IPC_CHANNELS.NOTIFICATION_TEST, () => {
    const notification = new Notification({
      title: "Flint Test",
      body: "Notifications are working!",
    });
    notification.show();
  });
}
