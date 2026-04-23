import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { FlintConfig, Meeting } from '../types'
import { createConfigStore, type ConfigStore } from '../config'
import { hideOverlay } from '../window/overlay'

let configStore: ConfigStore

export function getConfigStore(): ConfigStore {
  return configStore
}

export function registerIpcHandlers(): void {
  configStore = createConfigStore()

  ipcMain.on(IPC_CHANNELS.CHAT_SEND, (_event, prompt: string) => {
    console.log('[ipc] chat:send', prompt)
    // TODO: forward to Copilot session (Task 7)
  })

  ipcMain.handle(IPC_CHANNELS.MEETINGS_GET, (): Meeting[] => {
    // TODO: return from meeting cache (Task 8)
    return []
  })

  ipcMain.on(IPC_CHANNELS.MEETING_JOIN, (_event, joinUrl: string) => {
    shell.openExternal(joinUrl)
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
}
