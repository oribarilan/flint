import { app, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow, showOverlay, getOverlayWindow } from './window/overlay'
import { createTray, updateTrayBadge } from './window/tray'
import { registerHotkey, unregisterAllHotkeys } from './window/hotkey'
import { registerIpcHandlers, getConfigStore } from './ipc/handlers'
import { createCopilotManager } from './copilot/client'
import { createSessionManager } from './copilot/sessions'
import { createMeetingMonitor, type MeetingMonitor } from './meetings/monitor'
import { IPC_CHANNELS } from './ipc/channels'

const copilotManager = createCopilotManager()
let monitor: MeetingMonitor | null = null

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('sh.oribi.flint')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const config = getConfigStore().getAll()
  createOverlayWindow()
  createTray()
  registerHotkey(config.hotkey)

  // Start Copilot and meeting monitor
  try {
    await copilotManager.start()

    const sessionManager = createSessionManager({
      client: copilotManager.getClient()!,
      onChatDelta: (delta) => {
        const overlay = getOverlayWindow()
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send(IPC_CHANNELS.CHAT_DELTA, delta)
        }
      },
      onChatDone: () => {
        const overlay = getOverlayWindow()
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send(IPC_CHANNELS.CHAT_DONE)
        }
      },
    })

    monitor = createMeetingMonitor({
      sessionManager,
      getAlertMinutes: () => getConfigStore().getAll().alertMinutes,
      onMeetingsChanged: (meetings) => {
        const overlay = getOverlayWindow()
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send(IPC_CHANNELS.MEETINGS_UPDATE, meetings)
        }
      },
      onShowOverlay: (meetingId) => showOverlay(meetingId),
      onBadgeUpdate: updateTrayBadge,
    })

    monitor.start()

    // Override placeholder chat:send handler (registered with ipcMain.on)
    ipcMain.removeAllListeners(IPC_CHANNELS.CHAT_SEND)
    ipcMain.on(IPC_CHANNELS.CHAT_SEND, async (_event, prompt: string) => {
      try {
        await sessionManager.sendChatMessage(prompt)
      } catch (err) {
        console.error('[chat] Failed:', err)
      }
    })

    // Override placeholder meetings:get handler (registered with ipcMain.handle)
    ipcMain.removeHandler(IPC_CHANNELS.MEETINGS_GET)
    ipcMain.handle(IPC_CHANNELS.MEETINGS_GET, () => {
      return monitor?.getCache().getAll() ?? []
    })

    // Surface connection status
    const overlay = getOverlayWindow()
    if (overlay) {
      overlay.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, 'connected')
    }
  } catch (err) {
    console.error('[main] Failed to start Copilot:', err)
    const overlay = getOverlayWindow()
    if (overlay) {
      overlay.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, 'disconnected')
    }
  }

  copilotManager.onStatusChange((status) => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, status)
    }
  })
})

app.on('will-quit', async () => {
  unregisterAllHotkeys()
  monitor?.stop()
  await copilotManager.stop()
})

app.on('window-all-closed', () => {
  // Keep app running in tray — don't quit on window close (macOS pattern)
})
