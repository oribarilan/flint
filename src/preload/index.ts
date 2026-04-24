import { contextBridge, ipcRenderer } from 'electron'

const flintAPI = {
  platform: process.platform,

  chatSend: (prompt: string): void => {
    ipcRenderer.send('chat:send', prompt)
  },
  onChatDelta: (callback: (delta: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: string): void => {
      callback(delta)
    }
    ipcRenderer.on('chat:delta', handler)
    return () => {
      ipcRenderer.removeListener('chat:delta', handler)
    }
  },
  onChatDone: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('chat:done', handler)
    return () => {
      ipcRenderer.removeListener('chat:done', handler)
    }
  },

  getConfig: (): Promise<unknown> => ipcRenderer.invoke('config:get'),
  setConfig: (partial: Record<string, unknown>): void => {
    ipcRenderer.send('config:set', partial)
  },

  hideOverlay: (): void => {
    ipcRenderer.send('overlay:hide')
  },

  onConnectionStatus: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status)
    }
    ipcRenderer.on('connection:status', handler)
    return () => {
      ipcRenderer.removeListener('connection:status', handler)
    }
  },

  getAttentionItems: (): Promise<unknown[]> => ipcRenderer.invoke('attention:get'),
  onAttentionUpdate: (callback: (items: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, items: unknown[]): void => {
      callback(items)
    }
    ipcRenderer.on('attention:update', handler)
    return () => {
      ipcRenderer.removeListener('attention:update', handler)
    }
  },
  openAttentionItem: (id: string): void => {
    ipcRenderer.send('attention:open', id)
  },
}

contextBridge.exposeInMainWorld('flint', flintAPI)
