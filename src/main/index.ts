import { execSync } from 'child_process'
import { app, ipcMain, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow, getOverlayWindow } from './window/overlay'
import { createTray } from './window/tray'
import { registerHotkey, unregisterAllHotkeys } from './window/hotkey'
import { registerIpcHandlers, getConfigStore, getAttentionStore } from './ipc/handlers'
import { IPC_CHANNELS } from './ipc/channels'
import { createCopilotManager, type CopilotManager } from './copilot/client'
import { createSessionManager, type SessionManager } from './copilot/sessions'
import { getChatTools } from './copilot/tools'
import { filterModels, handleSetModel } from './ipc/model-handlers'
import { createPulseScheduler, type PulseScheduler } from './pulse/scheduler'
import { resolveTheme } from './theme'
import type { FlintConfig } from './types'

let copilotManager: CopilotManager | null = null
let sessionManager: SessionManager | null = null
let pulseScheduler: PulseScheduler | null = null

/** Resolve the Copilot CLI binary path using env → PATH → macOS fallback. */
function resolveCopilotCliPath(): string | undefined {
  // 1. Explicit env var
  if (process.env.COPILOT_CLI_PATH) {
    console.log('[main] Using COPILOT_CLI_PATH:', process.env.COPILOT_CLI_PATH)
    return process.env.COPILOT_CLI_PATH
  }

  // 2. PATH lookup via `which`
  try {
    const resolved = execSync('which copilot', { encoding: 'utf-8' }).trim()
    if (resolved) {
      console.log('[main] Found copilot in PATH:', resolved)
      return resolved
    }
  } catch {
    // `which` failed — not in PATH
  }

  // 3. macOS Homebrew fallback
  if (process.platform === 'darwin') {
    console.log('[main] Using macOS fallback: /opt/homebrew/bin/copilot')
    return '/opt/homebrew/bin/copilot'
  }

  // Let the SDK handle resolution
  return undefined
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('sh.oribi.flint')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const configStore = getConfigStore()
  const config = configStore.getAll()
  createOverlayWindow()
  createTray()
  registerHotkey(config.hotkey)

  // ── Theme IPC ──
  const sendThemeToRenderer = (theme: string): void => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC_CHANNELS.THEME_CHANGED, theme)
    }
  }

  // Send initial theme after window is ready
  const overlay = getOverlayWindow()
  if (overlay) {
    overlay.webContents.on('did-finish-load', () => {
      sendThemeToRenderer(resolveTheme(configStore.getAll().theme))
    })
  }

  // Listen for OS theme changes (only matters when config is "system")
  nativeTheme.on('updated', () => {
    const currentConfig = configStore.getAll()
    if (currentConfig.theme === 'system') {
      sendThemeToRenderer(resolveTheme('system'))
    }
  })

  // Push theme to renderer when config changes
  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, partial: Partial<FlintConfig>) => {
    if ('theme' in partial) {
      const resolved = resolveTheme(configStore.getAll().theme)
      sendThemeToRenderer(resolved)
    }
  })

  // ── Copilot lifecycle ──
  const cliPath = resolveCopilotCliPath()
  copilotManager = createCopilotManager(cliPath)

  // Wire connection:status IPC
  copilotManager.onStatusChange((status) => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, status)
    }
  })

  try {
    await copilotManager.start()
  } catch (err) {
    console.error('[main] CopilotManager failed to start:', err)
    return
  }

  const client = copilotManager.getClient()
  if (!client) {
    console.error('[main] No CopilotClient after start')
    return
  }

  // ── Chat tools ──
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

  // ── Session manager ──
  sessionManager = createSessionManager({
    client,
    getModel: () => configStore.getAll().model,
    getPollModel: () => configStore.getAll().pollModel,
    chatTools,
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
    onChatError: (error) => {
      const overlay = getOverlayWindow()
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send(IPC_CHANNELS.CHAT_DELTA, `\n⚠️ Error: ${error}`)
        overlay.webContents.send(IPC_CHANNELS.CHAT_DONE)
      }
    },
  })

  // ── IPC: chat ──
  ipcMain.on(IPC_CHANNELS.CHAT_SEND, async (_event, prompt: string) => {
    if (!sessionManager) return
    await sessionManager.sendChatMessage(prompt)
  })

  ipcMain.handle(IPC_CHANNELS.CHAT_RESET, async () => {
    if (!sessionManager) return
    await sessionManager.resetChat()
  })

  // ── IPC: models ──
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    const c = copilotManager?.getClient()
    if (!c) return []
    try {
      const models = await c.listModels()
      return filterModels(models)
    } catch (err) {
      console.error('[main] model:list error:', err)
      return []
    }
  })

  ipcMain.on(IPC_CHANNELS.MODEL_SET, async (_event, modelId: string) => {
    try {
      await handleSetModel(modelId, {
        session: sessionManager?.getChatSession() ?? null,
        configStore,
        sendToRenderer: (id) => {
          const overlay = getOverlayWindow()
          if (overlay && !overlay.isDestroyed()) {
            overlay.webContents.send(IPC_CHANNELS.MODEL_CHANGED, id)
          }
        },
      })
    } catch (err) {
      console.error('[main] model:set error:', err)
    }
  })

  // ── Pulse scheduler ──
  pulseScheduler = createPulseScheduler({
    sessionManager,
    copilotManager,
    attentionStore: getAttentionStore(),
    getConfig: () => configStore.getAll(),
    onOverlayFocus: (cb) => {
      const win = getOverlayWindow()
      if (win) win.on('focus', cb)
    },
    onOverlayBlur: (cb) => {
      const win = getOverlayWindow()
      if (win) win.on('blur', cb)
    },
  })

  const pollConfig = configStore.getAll()
  if (pollConfig.pollEnabled) {
    pulseScheduler.start()
  }

  console.log('[main] Ready — chat wired with CopilotManager + SessionManager')
})

app.on('will-quit', async () => {
  unregisterAllHotkeys()
  if (pulseScheduler) {
    pulseScheduler.stop()
  }
  if (copilotManager) {
    await copilotManager.stop()
  }
})

app.on('window-all-closed', () => {
  // Keep app running in tray
})
