import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from './channels'
import type { FlintConfig, Meeting } from '../types'
import { DEFAULT_CONFIG } from '../types'

export function registerIpcHandlers(): void {
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
    // TODO: return from electron-store (Task 3)
    return DEFAULT_CONFIG
  })

  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, _partial: Partial<FlintConfig>) => {
    // TODO: update electron-store (Task 3)
  })

  ipcMain.on(IPC_CHANNELS.OVERLAY_HIDE, () => {
    // TODO: hide overlay window (Task 4)
  })
}
