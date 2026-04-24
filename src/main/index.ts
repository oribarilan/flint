import { app, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { CopilotClient, approveAll } from '@github/copilot-sdk'
import type { CopilotSession } from '@github/copilot-sdk'
import { createOverlayWindow, getOverlayWindow } from './window/overlay'
import { createTray } from './window/tray'
import { registerHotkey, unregisterAllHotkeys } from './window/hotkey'
import { registerIpcHandlers, getConfigStore, getAttentionStore } from './ipc/handlers'
import { IPC_CHANNELS } from './ipc/channels'

import { getChatTools } from './copilot/tools'

let client: CopilotClient | null = null
let chatSession: CopilotSession | null = null

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

  // Use system-installed CLI (has plugins + auth), not the bundled one
  client = new CopilotClient({ cliPath: '/opt/homebrew/bin/copilot' })
  console.log('[main] CopilotClient created (using system CLI)')

  // Wire chat:send — create session lazily on first message
  ipcMain.removeAllListeners(IPC_CHANNELS.CHAT_SEND)
  ipcMain.on(IPC_CHANNELS.CHAT_SEND, async (_event, prompt: string) => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return

    try {
      // Lazy session creation
      if (!chatSession) {
        console.log('[main] Creating chat session...')
        const chatTools = getChatTools({
          onShowOverlay: () => {
            const win = getOverlayWindow()
            if (win && !win.isDestroyed()) win.show()
          },
          onAttentionUpdate: (items) => {
            const store = getAttentionStore()
            store.setItems(items)
            const win = getOverlayWindow()
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.ATTENTION_UPDATE, items)
            }
          },
        })
        chatSession = await client!.createSession({
          model: 'gpt-4.1',
          onPermissionRequest: approveAll,
          streaming: true,
          systemMessage: {
            content:
              'You are Flint, a personal work assistant. You have access to the user\'s Microsoft 365 data via Work IQ (calendar, email, Teams, documents) — it\'s available as a pre-installed CLI plugin. You also have an attention panel where you can surface relevant items for the user. Use set_attention_items to show meetings, messages, emails, or any work items. Each item needs an id, icon (emoji), title, description, and optionally a timestamp (ISO 8601) and openAction ({type:"url",url:"..."}). When the user has items selected, their context will be provided — use it to give relevant answers. When showing calendar events or work items, always populate the attention panel with set_attention_items. Be concise and helpful.',
          },
          tools: chatTools,
        })

        chatSession.on('assistant.message_delta', (event) => {
          const win = getOverlayWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.CHAT_DELTA, event.data.deltaContent)
          }
        })

        chatSession.on('session.idle', () => {
          const win = getOverlayWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.CHAT_DONE)
          }
        })

        console.log('[main] Chat session created:', chatSession.sessionId)
      }

      console.log('[main] Sending:', prompt)
      await chatSession.sendAndWait({ prompt }, 60_000)
    } catch (err) {
      console.error('[main] Chat error:', err)
      // Surface error to UI so it doesn't hang on "Thinking..."
      overlay.webContents.send(IPC_CHANNELS.CHAT_DELTA, `\n⚠️ Error: ${err instanceof Error ? err.message : String(err)}`)
      overlay.webContents.send(IPC_CHANNELS.CHAT_DONE)
    }
  })

  console.log('[main] Ready — chat wired with Work IQ MCP')
})

app.on('will-quit', async () => {
  unregisterAllHotkeys()
  if (client) {
    try {
      await client.stop()
    } catch {
      // ignore cleanup errors
    }
  }
})

app.on('window-all-closed', () => {
  // Keep app running in tray
})
