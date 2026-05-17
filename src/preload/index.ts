import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../main/ipc/channels";

const flintAPI = {
  platform: process.platform,

  chatSend: (prompt: string): void => {
    ipcRenderer.send(IPC_CHANNELS.CHAT_SEND, prompt);
  },
  chatReset: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CHAT_RESET) as Promise<void>,
  onChatDelta: (callback: (delta: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: string): void => {
      callback(delta);
    };
    ipcRenderer.on(IPC_CHANNELS.CHAT_DELTA, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHAT_DELTA, handler);
    };
  },
  onChatDone: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback();
    };
    ipcRenderer.on(IPC_CHANNELS.CHAT_DONE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHAT_DONE, handler);
    };
  },

  getConfig: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  setConfig: (partial: Record<string, unknown>): void => {
    ipcRenderer.send(IPC_CHANNELS.CONFIG_SET, partial);
  },

  hideOverlay: (): void => {
    ipcRenderer.send(IPC_CHANNELS.OVERLAY_HIDE);
  },

  onConnectionStatus: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status);
    };
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATUS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONNECTION_STATUS, handler);
    };
  },

  getAttentionItems: (): Promise<unknown[]> => ipcRenderer.invoke(IPC_CHANNELS.ATTENTION_GET),
  onAttentionUpdate: (callback: (items: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, items: unknown[]): void => {
      callback(items);
    };
    ipcRenderer.on(IPC_CHANNELS.ATTENTION_UPDATE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ATTENTION_UPDATE, handler);
    };
  },
  openAttentionItem: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.ATTENTION_OPEN, id);
  },
  openLink: (url: string): void => {
    ipcRenderer.send(IPC_CHANNELS.LINK_OPEN, url);
  },
  testNotification: (): void => {
    ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_TEST);
  },

  listModels: (): Promise<{ id: string; name: string }[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_LIST) as Promise<{ id: string; name: string }[]>,
  setModel: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.MODEL_SET, id);
  },
  onModelChanged: (callback: (modelId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, modelId: string): void => {
      callback(modelId);
    };
    ipcRenderer.on(IPC_CHANNELS.MODEL_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MODEL_CHANGED, handler);
    };
  },

  onThemeChanged: (callback: (theme: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, theme: string): void => {
      callback(theme);
    };
    ipcRenderer.on(IPC_CHANNELS.THEME_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.THEME_CHANGED, handler);
    };
  },

  onSpotlightShow: (callback: (meeting: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, meeting: unknown): void => {
      callback(meeting);
    };
    ipcRenderer.on(IPC_CHANNELS.SPOTLIGHT_SHOW, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SPOTLIGHT_SHOW, handler);
    };
  },
  spotlightDismiss: (): void => {
    ipcRenderer.send(IPC_CHANNELS.SPOTLIGHT_DISMISS);
  },
  spotlightJoin: (joinUrl: string): void => {
    ipcRenderer.send(IPC_CHANNELS.SPOTLIGHT_JOIN, joinUrl);
  },

  onBlocksUpdate: (callback: (block: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, block: unknown): void => {
      callback(block);
    };
    ipcRenderer.on(IPC_CHANNELS.BLOCKS_UPDATE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.BLOCKS_UPDATE, handler);
    };
  },
  sendBlocksAction: (action: { type: string; payload: Record<string, string> }): void => {
    ipcRenderer.send(IPC_CHANNELS.BLOCKS_ACTION, action);
  },
};

contextBridge.exposeInMainWorld("flint", flintAPI);
