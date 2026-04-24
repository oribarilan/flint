import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { AttentionItem, FlintConfig } from '../types'
import { createConfigStore, type ConfigStore } from '../config'
import { createAttentionStore, type AttentionStore } from '../attention/store'
import { hideOverlay } from '../window/overlay'

let configStore: ConfigStore
let attentionStore: AttentionStore

export function getConfigStore(): ConfigStore {
  return configStore
}

export function getAttentionStore(): AttentionStore {
  return attentionStore
}

export function registerIpcHandlers(): void {
  configStore = createConfigStore()
  attentionStore = createAttentionStore()

  ipcMain.on(IPC_CHANNELS.CHAT_SEND, (_event, prompt: string) => {
    console.log('[ipc] chat:send', prompt)
    // TODO: forward to Copilot session (Task 7)
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, (): FlintConfig => {
    return configStore.getAll()
  })

  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, partial: Partial<FlintConfig>) => {
    configStore.update(partial)
  })

  ipcMain.on(IPC_CHANNELS.OVERLAY_HIDE, () => {
    hideOverlay()
  })

  ipcMain.handle(IPC_CHANNELS.ATTENTION_GET, (): AttentionItem[] => {
    return attentionStore.getAll()
  })

  ipcMain.on(IPC_CHANNELS.ATTENTION_OPEN, (_event, id: string) => {
    const item = attentionStore.findById(id)
    if (item?.openAction?.type === 'url') {
      shell.openExternal(item.openAction.url)
    }
  })
}
