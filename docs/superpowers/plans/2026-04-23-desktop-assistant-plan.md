# Flint Desktop Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Flint from a Tauri app launcher into an Electron-based personal work assistant with Copilot SDK + Work IQ MCP for meeting alerts and conversational calendar queries.

**Architecture:** Electron main process hosts CopilotClient (two sessions: chat + monitor), meeting cache, window manager, tray, and notifications. React renderer shows meeting cards and a chat panel. Communication via typed IPC through contextBridge preload.

**Tech Stack:** Electron 39+, electron-vite 5, React 19, Zustand 5, TypeScript (strict), @github/copilot-sdk, @microsoft/workiq, electron-store, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-23-desktop-assistant-design.md`

---

## Directory Convention

The plan follows electron-vite's **recommended convention** (zero-config entry point discovery) rather than the spec's custom `electron/` layout. This eliminates manual rollupOptions config:

```
src/main/index.ts        → Electron main process
src/preload/index.ts     → Preload script
src/renderer/index.html  → Renderer HTML entry
src/renderer/src/        → React app (components, hooks, stores, styles)
```

The spec's `electron/copilot/`, `electron/meetings/`, `electron/window/` modules move under `src/main/`. The spec's `src/` renderer code moves under `src/renderer/src/`. This is a directory rename, not a logic change.

---

## Parallel Lanes

```
Lane A (backend):  Task 1 → 2 → 3 → 5 → 6 → 7 → 8
Lane B (frontend): Task 1 → 2 → 4 → 9 → 10 → 11 → 12 → 13 → 14
Lane C (integration): Task 15 → 16 (after both lanes)

Tasks 4, 9-14 (frontend) can run in parallel with Tasks 5-8 (backend)
once IPC types are defined in Task 2.
```

---

## Task 1: Strip Tauri, Scaffold Electron

**Files:**
- Delete: `src-tauri/` (entire directory)
- Delete: `spec.md`, `plan.md`, `gaps.md`, `specs/kits.md`, `specs/action-panel.md`, `specs/keybindings.md`
- Delete: `.claude/skills/crossplatform/`, `.claude/skills/debug/`, `.claude/skills/tauri/`
- Delete: `src/components/SearchBar.tsx`, `src/components/ResultsList.tsx`, `src/components/ActionPanel.tsx`, `src/components/HintBar.tsx`, `src/components/KindIcon.tsx`, `src/components/ResultMeta.tsx`
- Delete: `src/hooks/useSearch.ts`, `src/hooks/useCommandActivation.ts`, `src/hooks/usePrefixDetection.ts`, `src/hooks/useActionPanelDebug.ts`, `src/hooks/useAppIcon.ts`, `src/hooks/useSessionMonitor.ts`
- Delete: `src/stores/searchStore.ts`
- Delete: `src/kits/` (entire directory)
- Delete: `src/lib/commands.ts`, `src/lib/focus.ts`, `src/lib/platform.ts`, `src/lib/applyTheme.ts`
- Delete: `simulator/` (entire directory)
- Delete: `vite.config.simulator.ts`, `playwright.config.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Modify: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Delete Tauri and obsolete files**

```bash
rm -rf src-tauri
rm -f spec.md plan.md gaps.md
rm -f specs/kits.md specs/action-panel.md specs/keybindings.md
rm -rf .claude/skills/crossplatform .claude/skills/debug .claude/skills/tauri
rm -rf simulator vite.config.simulator.ts playwright.config.ts
rm -f src/components/SearchBar.tsx src/components/SearchBar.module.css
rm -f src/components/ResultsList.tsx src/components/ResultsList.module.css
rm -f src/components/ActionPanel.tsx src/components/ActionPanel.module.css
rm -f src/components/HintBar.tsx src/components/HintBar.module.css
rm -f src/components/KindIcon.tsx src/components/KindIcon.module.css
rm -f src/components/ResultMeta.tsx
rm -f src/hooks/useSearch.ts src/hooks/useCommandActivation.ts src/hooks/usePrefixDetection.ts
rm -f src/hooks/useActionPanelDebug.ts src/hooks/useAppIcon.ts src/hooks/useSessionMonitor.ts
rm -f src/stores/searchStore.ts
rm -rf src/kits
rm -f src/lib/commands.ts src/lib/focus.ts src/lib/platform.ts src/lib/applyTheme.ts
rm -f vite.config.ts
```

- [ ] **Step 2: Move existing renderer files into electron-vite convention**

```bash
mkdir -p src/main src/preload src/renderer/src
# Move existing React source into renderer
mv src/components src/renderer/src/
mv src/hooks src/renderer/src/
mv src/stores src/renderer/src/
mv src/lib src/renderer/src/
mv src/styles src/renderer/src/
mv src/main.tsx src/renderer/src/main.tsx
mv src/App.tsx src/renderer/src/App.tsx
mv src/App.module.css src/renderer/src/App.module.css 2>/dev/null || true
mv src/vite-env.d.ts src/renderer/src/env.d.ts 2>/dev/null || true
mv src/test-setup.ts src/renderer/src/test-setup.ts 2>/dev/null || true
# Move index.html into renderer root
mv index.html src/renderer/index.html
```

- [ ] **Step 3: Install Electron and electron-vite dependencies**

```bash
npm uninstall @tauri-apps/api @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-shell @tauri-apps/plugin-os @tauri-apps/plugin-process @tauri-apps/plugin-dialog 2>/dev/null || true
npm install --save-dev electron electron-vite electron-builder @electron-toolkit/tsconfig @electron-toolkit/utils @electron-toolkit/preload
npm install electron-store
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```typescript
// electron.vite.config.ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 5: Create TypeScript configs**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "src/main/**/*",
    "src/preload/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"]
  }
}
```

`tsconfig.web.json`:
```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/env.d.ts",
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/preload/*.d.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/renderer/src/*"]
    }
  }
}
```

- [ ] **Step 6: Create minimal Electron main process**

`src/main/index.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let overlayWindow: BrowserWindow | null = null

function createWindow(): void {
  overlayWindow = new BrowserWindow({
    width: 680,
    height: 500,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  overlayWindow.on('ready-to-show', () => {
    overlayWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 7: Create minimal preload script**

`src/preload/index.ts`:
```typescript
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('flint', {
  platform: process.platform
})
```

- [ ] **Step 8: Update renderer index.html**

`src/renderer/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Flint</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Update renderer entry to be minimal**

`src/renderer/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'

function App(): JSX.Element {
  return <div style={{ padding: 24, color: '#e2e8f0' }}>Flint is running on Electron.</div>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 10: Update package.json scripts and main field**

Update `package.json`:
```json
{
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "build:mac": "electron-vite build && electron-builder --mac"
  }
}
```

Remove old scripts (`tauri dev`, `tauri build`, etc.) and the `tauri` config section if present.

- [ ] **Step 11: Verify the app launches**

```bash
npm run dev
```

Expected: An Electron window opens showing "Flint is running on Electron." on a dark background. The window is frameless, always-on-top, and transparent.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "feat: strip Tauri, scaffold Electron with electron-vite"
```

---

## Task 2: Shared Types + IPC Preload Bridge

**Files:**
- Create: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/handlers.ts`
- Create: `src/preload/index.ts` (update)
- Create: `src/renderer/src/lib/ipc.ts`
- Create: `src/main/types.ts`

- [ ] **Step 1: Create shared types**

`src/main/types.ts`:
```typescript
export interface Meeting {
  id: string
  title: string
  startTime: string // ISO 8601 — serializable over IPC
  endTime: string
  attendees: string[]
  organizer: string
  joinUrl?: string
  agenda?: string
}

export interface FlintConfig {
  hotkey: string
  alertMinutes: number
  launchAtLogin: boolean
  showTrayIcon: boolean
}

export const DEFAULT_CONFIG: FlintConfig = {
  hotkey: 'Option+Space',
  alertMinutes: 5,
  launchAtLogin: true,
  showTrayIcon: true,
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'
```

- [ ] **Step 2: Define IPC channel names**

`src/main/ipc/channels.ts`:
```typescript
export const IPC_CHANNELS = {
  // renderer → main
  CHAT_SEND: 'chat:send',
  MEETINGS_GET: 'meetings:get',
  MEETING_JOIN: 'meeting:join',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  OVERLAY_HIDE: 'overlay:hide',

  // main → renderer
  CHAT_DELTA: 'chat:delta',
  CHAT_DONE: 'chat:done',
  MEETINGS_UPDATE: 'meetings:update',
  CONNECTION_STATUS: 'connection:status',
} as const
```

- [ ] **Step 3: Update preload to expose typed API**

`src/preload/index.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

export type FlintAPI = typeof flintAPI

const flintAPI = {
  platform: process.platform,

  // Chat
  chatSend: (prompt: string): void => {
    ipcRenderer.send('chat:send', prompt)
  },
  onChatDelta: (callback: (delta: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: string): void => {
      callback(delta)
    }
    ipcRenderer.on('chat:delta', handler)
    return () => ipcRenderer.removeListener('chat:delta', handler)
  },
  onChatDone: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('chat:done', handler)
    return () => ipcRenderer.removeListener('chat:done', handler)
  },

  // Meetings
  getMeetings: (): Promise<unknown[]> => ipcRenderer.invoke('meetings:get'),
  joinMeeting: (joinUrl: string): void => {
    ipcRenderer.send('meeting:join', joinUrl)
  },
  onMeetingsUpdate: (callback: (meetings: unknown[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, meetings: unknown[]): void => {
      callback(meetings)
    }
    ipcRenderer.on('meetings:update', handler)
    return () => ipcRenderer.removeListener('meetings:update', handler)
  },

  // Config
  getConfig: (): Promise<unknown> => ipcRenderer.invoke('config:get'),
  setConfig: (partial: Record<string, unknown>): void => {
    ipcRenderer.send('config:set', partial)
  },

  // Window
  hideOverlay: (): void => {
    ipcRenderer.send('overlay:hide')
  },

  // Connection
  onConnectionStatus: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status)
    }
    ipcRenderer.on('connection:status', handler)
    return () => ipcRenderer.removeListener('connection:status', handler)
  },
}

contextBridge.exposeInMainWorld('flint', flintAPI)
```

- [ ] **Step 4: Create renderer-side typed IPC wrapper**

`src/renderer/src/lib/ipc.ts`:
```typescript
import type { Meeting, FlintConfig, ConnectionStatus } from '../../../main/types'

interface FlintAPI {
  platform: string
  chatSend: (prompt: string) => void
  onChatDelta: (callback: (delta: string) => void) => () => void
  onChatDone: (callback: () => void) => () => void
  getMeetings: () => Promise<Meeting[]>
  joinMeeting: (joinUrl: string) => void
  onMeetingsUpdate: (callback: (meetings: Meeting[]) => void) => () => void
  getConfig: () => Promise<FlintConfig>
  setConfig: (partial: Partial<FlintConfig>) => void
  hideOverlay: () => void
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => () => void
}

declare global {
  interface Window {
    flint: FlintAPI
  }
}

export const flint = window.flint
```

- [ ] **Step 5: Register placeholder IPC handlers in main**

`src/main/ipc/handlers.ts`:
```typescript
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

  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, partial: Partial<FlintConfig>) => {
    console.log('[ipc] config:set', partial)
    // TODO: update electron-store (Task 3)
  })

  ipcMain.on(IPC_CHANNELS.OVERLAY_HIDE, () => {
    // TODO: hide overlay window (Task 4)
  })
}
```

- [ ] **Step 6: Wire handlers into main process**

Update `src/main/index.ts` — add after imports:
```typescript
import { registerIpcHandlers } from './ipc/handlers'
```

Add inside `app.whenReady().then()` before `createWindow()`:
```typescript
registerIpcHandlers()
```

- [ ] **Step 7: Verify app still launches with IPC wired**

```bash
npm run dev
```

Expected: App launches, no errors in console.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add typed IPC bridge with preload and channel definitions"
```

---

## Task 3: Config Store

**Files:**
- Create: `src/main/config.ts`
- Modify: `src/main/ipc/handlers.ts`
- Test: `src/main/__tests__/config.test.ts`

- [ ] **Step 1: Write tests for config store**

`src/main/__tests__/config.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown> = {}
      get(key: string, defaultValue?: unknown): unknown {
        return this.data[key] ?? defaultValue
      }
      set(key: string, value: unknown): void
      set(obj: Record<string, unknown>): void
      set(keyOrObj: string | Record<string, unknown>, value?: unknown): void {
        if (typeof keyOrObj === 'string') {
          this.data[keyOrObj] = value
        } else {
          Object.assign(this.data, keyOrObj)
        }
      }
    }
  }
})

import { createConfigStore } from '../config'
import { DEFAULT_CONFIG } from '../types'

describe('ConfigStore', () => {
  let store: ReturnType<typeof createConfigStore>

  beforeEach(() => {
    store = createConfigStore()
  })

  it('returns default config when empty', () => {
    expect(store.getAll()).toEqual(DEFAULT_CONFIG)
  })

  it('updates a single setting', () => {
    store.update({ alertMinutes: 10 })
    expect(store.getAll().alertMinutes).toBe(10)
  })

  it('preserves other settings on partial update', () => {
    store.update({ alertMinutes: 10 })
    const config = store.getAll()
    expect(config.hotkey).toBe(DEFAULT_CONFIG.hotkey)
    expect(config.launchAtLogin).toBe(DEFAULT_CONFIG.launchAtLogin)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/config.test.ts
```

Expected: FAIL — `createConfigStore` not found.

- [ ] **Step 3: Implement config store**

`src/main/config.ts`:
```typescript
import Store from 'electron-store'
import type { FlintConfig } from './types'
import { DEFAULT_CONFIG } from './types'

export interface ConfigStore {
  getAll(): FlintConfig
  update(partial: Partial<FlintConfig>): void
}

export function createConfigStore(): ConfigStore {
  const store = new Store<FlintConfig>({
    defaults: DEFAULT_CONFIG,
    migrations: {},
  })

  return {
    getAll(): FlintConfig {
      return {
        hotkey: store.get('hotkey', DEFAULT_CONFIG.hotkey) as string,
        alertMinutes: store.get('alertMinutes', DEFAULT_CONFIG.alertMinutes) as number,
        launchAtLogin: store.get('launchAtLogin', DEFAULT_CONFIG.launchAtLogin) as boolean,
        showTrayIcon: store.get('showTrayIcon', DEFAULT_CONFIG.showTrayIcon) as boolean,
      }
    },

    update(partial: Partial<FlintConfig>): void {
      store.set(partial as Record<string, unknown>)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/main/__tests__/config.test.ts
```

Expected: PASS

- [ ] **Step 5: Wire config into IPC handlers**

Update `src/main/ipc/handlers.ts` — change the signature and config handlers:

```typescript
import { createConfigStore, type ConfigStore } from '../config'

let configStore: ConfigStore

export function registerIpcHandlers(): void {
  configStore = createConfigStore()

  // ... keep existing handlers, update these two:

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return configStore.getAll()
  })

  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, partial: Partial<FlintConfig>) => {
    configStore.update(partial)
  })
}

export function getConfigStore(): ConfigStore {
  return configStore
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add electron-store config with typed getAll/update"
```

---

## Task 4: Window Management (Overlay, Tray, Hotkey)

**Files:**
- Create: `src/main/window/overlay.ts`
- Create: `src/main/window/tray.ts`
- Create: `src/main/window/hotkey.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create overlay window module**

`src/main/window/overlay.ts`:
```typescript
import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let overlayWindow: BrowserWindow | null = null

export function createOverlayWindow(): BrowserWindow {
  overlayWindow = new BrowserWindow({
    width: 680,
    height: 500,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  overlayWindow.on('blur', () => {
    hideOverlay()
  })

  return overlayWindow
}

export function showOverlay(meetingId?: string): void {
  if (!overlayWindow) return
  if (meetingId) {
    overlayWindow.webContents.send('meeting:focus', meetingId)
  }
  overlayWindow.center()
  overlayWindow.show()
  overlayWindow.focus()
}

export function hideOverlay(): void {
  if (!overlayWindow || !overlayWindow.isVisible()) return
  overlayWindow.hide()
}

export function toggleOverlay(): void {
  if (!overlayWindow) return
  if (overlayWindow.isVisible()) {
    hideOverlay()
  } else {
    showOverlay()
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}
```

- [ ] **Step 2: Create tray module**

`src/main/window/tray.ts`:
```typescript
import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { showOverlay } from './overlay'

let tray: Tray | null = null

export function createTray(): Tray {
  // Use a 16x16 template image for macOS menu bar
  const iconPath = join(__dirname, '../../resources/trayTemplate.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
    // Fallback: create a simple icon
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Flint')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Flint', click: () => showOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => showOverlay())

  return tray
}

export function updateTrayBadge(count: number): void {
  if (!tray) return
  tray.setTitle(count > 0 ? String(count) : '')
}
```

- [ ] **Step 3: Create hotkey module**

`src/main/window/hotkey.ts`:
```typescript
import { globalShortcut } from 'electron'
import { toggleOverlay } from './overlay'

let currentHotkey: string | null = null

export function registerHotkey(accelerator: string): boolean {
  unregisterHotkey()

  try {
    const success = globalShortcut.register(accelerator, () => {
      toggleOverlay()
    })
    if (success) {
      currentHotkey = accelerator
    }
    return success
  } catch (err) {
    console.error('[hotkey] Failed to register:', accelerator, err)
    return false
  }
}

export function unregisterHotkey(): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
    currentHotkey = null
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll()
  currentHotkey = null
}
```

- [ ] **Step 4: Rewrite main process to use modules**

Replace `src/main/index.ts`:
```typescript
import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow } from './window/overlay'
import { createTray } from './window/tray'
import { registerHotkey, unregisterAllHotkeys } from './window/hotkey'
import { registerIpcHandlers, getConfigStore } from './ipc/handlers'

app.whenReady().then(() => {
  electronApp.setAppUserModelId('sh.oribi.flint')

  // Optimize window shortcuts in dev
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const config = getConfigStore().getAll()
  createOverlayWindow()
  createTray()
  registerHotkey(config.hotkey)
})

app.on('will-quit', () => {
  unregisterAllHotkeys()
})

app.on('window-all-closed', (e: Event) => {
  // Keep app running in tray on macOS
  e.preventDefault()
})
```

- [ ] **Step 5: Wire overlay:hide into IPC handler**

Update the `OVERLAY_HIDE` handler in `src/main/ipc/handlers.ts`:
```typescript
import { hideOverlay } from '../window/overlay'

// In registerIpcHandlers():
ipcMain.on(IPC_CHANNELS.OVERLAY_HIDE, () => {
  hideOverlay()
})
```

- [ ] **Step 6: Create a placeholder tray icon resource**

```bash
mkdir -p resources
# Create a 1x1 transparent PNG as placeholder (will be replaced with real icon)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10\x00\x00\x00\x10\x08\x06\x00\x00\x00\x1f\xf3\xffa\x00\x00\x00\x0eIDATx\x9cc\x60\x18\x05\xa3\x60\x14\x8c\x02\x08\x00\x00\x04\x10\x00\x01\xc3\xb3\x75\xb5\x00\x00\x00\x00IEND\xaeB\x60\x82' > resources/trayTemplate.png
```

- [ ] **Step 7: Verify hotkey toggle and tray work**

```bash
npm run dev
```

Expected: App launches to tray. Press `Option+Space` — overlay appears. Press again — hides. Click tray icon — shows overlay. Clicking outside the overlay hides it.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add overlay window, system tray, and global hotkey"
```

---

## Task 5: Copilot SDK Client Wrapper

**Files:**
- Create: `src/main/copilot/client.ts`
- Test: `src/main/__tests__/copilot-client.test.ts`

- [ ] **Step 1: Install Copilot SDK**

```bash
npm install @github/copilot-sdk
```

- [ ] **Step 2: Write test for client lifecycle**

`src/main/__tests__/copilot-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStop = vi.fn()
const mockCreateSession = vi.fn().mockResolvedValue({ sessionId: 'test' })

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: vi.fn().mockImplementation(() => ({
    stop: mockStop,
    createSession: mockCreateSession,
  })),
  approveAll: vi.fn(),
}))

import { createCopilotManager } from '../copilot/client'

describe('CopilotManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a manager in disconnected state', () => {
    const manager = createCopilotManager()
    expect(manager.getStatus()).toBe('disconnected')
  })

  it('transitions to connected after start', async () => {
    const manager = createCopilotManager()
    await manager.start()
    expect(manager.getStatus()).toBe('connected')
  })

  it('calls client.stop on shutdown', async () => {
    const manager = createCopilotManager()
    await manager.start()
    await manager.stop()
    expect(mockStop).toHaveBeenCalled()
    expect(manager.getStatus()).toBe('disconnected')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/copilot-client.test.ts
```

Expected: FAIL — `createCopilotManager` not found.

- [ ] **Step 4: Implement Copilot client wrapper**

`src/main/copilot/client.ts`:
```typescript
import { CopilotClient } from '@github/copilot-sdk'
import type { ConnectionStatus } from '../types'

export interface CopilotManager {
  start(): Promise<void>
  stop(): Promise<void>
  getClient(): CopilotClient | null
  getStatus(): ConnectionStatus
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void
}

export function createCopilotManager(): CopilotManager {
  let client: CopilotClient | null = null
  let status: ConnectionStatus = 'disconnected'
  const listeners: Set<(status: ConnectionStatus) => void> = new Set()

  function setStatus(newStatus: ConnectionStatus): void {
    status = newStatus
    for (const listener of listeners) {
      listener(newStatus)
    }
  }

  return {
    async start(): Promise<void> {
      try {
        setStatus('reconnecting')
        client = new CopilotClient()
        setStatus('connected')
      } catch (err) {
        console.error('[copilot] Failed to start:', err)
        setStatus('disconnected')
        throw err
      }
    },

    async stop(): Promise<void> {
      if (client) {
        await client.stop()
        client = null
      }
      setStatus('disconnected')
    },

    getClient(): CopilotClient | null {
      return client
    },

    getStatus(): ConnectionStatus {
      return status
    },

    onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/main/__tests__/copilot-client.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add CopilotManager with lifecycle and status tracking"
```

---

## Task 6: Custom Copilot Tools

**Files:**
- Create: `src/main/copilot/tools.ts`
- Test: `src/main/__tests__/copilot-tools.test.ts`

- [ ] **Step 1: Write tests for tools**

`src/main/__tests__/copilot-tools.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
  shell: { openExternal: vi.fn() },
}))

vi.mock('@github/copilot-sdk', () => ({
  defineTool: vi.fn((_name, config) => ({
    name: _name,
    handler: config.handler,
  })),
}))

import { createTools } from '../copilot/tools'
import type { Meeting } from '../types'

describe('Copilot Tools', () => {
  it('report_meetings handler updates cache callback', async () => {
    const onMeetings = vi.fn()
    const tools = createTools({ onMeetings, onShowOverlay: vi.fn() })

    const reportTool = tools.find((t) => t.name === 'report_meetings')
    expect(reportTool).toBeDefined()

    const meetings: Meeting[] = [
      {
        id: '1',
        title: 'Standup',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        attendees: ['Alice'],
        organizer: 'Bob',
      },
    ]

    const result = await reportTool!.handler({ meetings })
    expect(onMeetings).toHaveBeenCalledWith(meetings)
    expect(result).toBe('ok')
  })

  it('get_meetings handler returns from getter', async () => {
    const meetings: Meeting[] = [
      {
        id: '2',
        title: 'Retro',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        attendees: [],
        organizer: 'Carol',
      },
    ]
    const tools = createTools({
      onMeetings: vi.fn(),
      onShowOverlay: vi.fn(),
      getMeetings: () => meetings,
    })

    const getTool = tools.find((t) => t.name === 'get_meetings')
    const result = await getTool!.handler({})
    expect(result).toEqual(meetings)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/main/__tests__/copilot-tools.test.ts
```

Expected: FAIL — `createTools` not found.

- [ ] **Step 3: Implement tools**

`src/main/copilot/tools.ts`:
```typescript
import { defineTool } from '@github/copilot-sdk'
import { Notification, shell } from 'electron'
import type { Meeting } from '../types'

interface ToolCallbacks {
  onMeetings: (meetings: Meeting[]) => void
  onShowOverlay: (meetingId?: string) => void
  getMeetings?: () => Meeting[]
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createTools(callbacks: ToolCallbacks) {
  const reportMeetings = defineTool('report_meetings', {
    description:
      'Report a list of upcoming meetings. Call this with structured meeting data.',
    parameters: {
      type: 'object',
      properties: {
        meetings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique meeting ID' },
              title: { type: 'string', description: 'Meeting title' },
              startTime: { type: 'string', description: 'ISO 8601 start time' },
              endTime: { type: 'string', description: 'ISO 8601 end time' },
              attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee names' },
              organizer: { type: 'string', description: 'Organizer name' },
              joinUrl: { type: 'string', description: 'Meeting join URL' },
              agenda: { type: 'string', description: 'Meeting agenda' },
            },
            required: ['id', 'title', 'startTime', 'endTime', 'attendees', 'organizer'],
          },
        },
      },
      required: ['meetings'],
    },
    handler: async (args: { meetings: Meeting[] }) => {
      callbacks.onMeetings(args.meetings)
      return 'ok'
    },
  })

  const getMeetings = defineTool('get_meetings', {
    description: 'Get the current list of upcoming meetings from the local cache.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      return callbacks.getMeetings?.() ?? []
    },
  })

  const showNotification = defineTool('show_notification', {
    description: 'Show a native OS notification to the user.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        body: { type: 'string', description: 'Notification body text' },
      },
      required: ['title', 'body'],
    },
    handler: async (args: { title: string; body: string }) => {
      const notification = new Notification({ title: args.title, body: args.body })
      notification.show()
      return 'shown'
    },
  })

  const joinMeeting = defineTool('join_meeting', {
    description: 'Open a meeting join URL in the default browser.',
    parameters: {
      type: 'object',
      properties: {
        joinUrl: { type: 'string', description: 'The meeting join URL' },
      },
      required: ['joinUrl'],
    },
    handler: async (args: { joinUrl: string }) => {
      await shell.openExternal(args.joinUrl)
      return 'opened'
    },
  })

  const showOverlay = defineTool('show_overlay', {
    description: 'Show the Flint overlay window, optionally focused on a specific meeting.',
    parameters: {
      type: 'object',
      properties: {
        meetingId: { type: 'string', description: 'Optional meeting ID to focus on' },
      },
    },
    handler: async (args: { meetingId?: string }) => {
      callbacks.onShowOverlay(args.meetingId)
      return 'shown'
    },
  })

  return [reportMeetings, getMeetings, showNotification, joinMeeting, showOverlay]
}

/** Tools for the monitor session (only needs report_meetings) */
export function createMonitorTools(callbacks: Pick<ToolCallbacks, 'onMeetings'>): ReturnType<typeof defineTool>[] {
  const tools = createTools({ ...callbacks, onShowOverlay: () => {} })
  return tools.filter((t) => t.name === 'report_meetings')
}

/** Tools for the chat session (everything except report_meetings) */
export function createChatTools(callbacks: Omit<ToolCallbacks, 'onMeetings'>): ReturnType<typeof defineTool>[] {
  const tools = createTools({ onMeetings: () => {}, ...callbacks })
  return tools.filter((t) => t.name !== 'report_meetings')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/main/__tests__/copilot-tools.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Copilot custom tools (report_meetings, get_meetings, notify, join, overlay)"
```

---

## Task 7: Session Management

**Files:**
- Create: `src/main/copilot/sessions.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create session manager**

`src/main/copilot/sessions.ts`:
```typescript
import type { CopilotClient } from '@github/copilot-sdk'
import { approveAll } from '@github/copilot-sdk'
import { createMonitorTools, createChatTools } from './tools'
import type { Meeting } from '../types'

interface SessionManagerConfig {
  client: CopilotClient
  onMeetings: (meetings: Meeting[]) => void
  onShowOverlay: (meetingId?: string) => void
  getMeetings: () => Meeting[]
  onChatDelta: (delta: string) => void
  onChatDone: () => void
}

export interface SessionManager {
  initSessions(): Promise<void>
  sendChatMessage(prompt: string): Promise<void>
  sendMonitorPoll(): Promise<void>
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  let chatSession: Awaited<ReturnType<CopilotClient['createSession']>> | null = null
  let monitorSession: Awaited<ReturnType<CopilotClient['createSession']>> | null = null

  return {
    async initSessions(): Promise<void> {
      const monitorTools = createMonitorTools({ onMeetings: config.onMeetings })
      monitorSession = await config.client.createSession({
        sessionId: 'flint-monitor',
        model: 'gpt-4.1',
        onPermissionRequest: approveAll,
        mcpServers: {
          'work-iq': {
            type: 'local',
            command: 'npx',
            args: ['-y', '@microsoft/workiq', 'mcp'],
            tools: ['*'],
          },
        },
        tools: monitorTools,
      })

      const chatTools = createChatTools({
        onShowOverlay: config.onShowOverlay,
        getMeetings: config.getMeetings,
      })
      chatSession = await config.client.createSession({
        sessionId: 'flint-main',
        model: 'gpt-4.1',
        streaming: true,
        onPermissionRequest: approveAll,
        systemMessage: {
          content:
            'You are Flint, a personal work assistant. Help the user manage their calendar, meetings, and work communications. Be concise and actionable. Use the get_meetings tool to check the user\'s upcoming meetings.',
        },
        tools: chatTools,
      })

      chatSession.on('assistant.message_delta', (event) => {
        config.onChatDelta(event.data.deltaContent)
      })
      chatSession.on('session.idle', () => {
        config.onChatDone()
      })
    },

    async sendChatMessage(prompt: string): Promise<void> {
      if (!chatSession) {
        throw new Error('Chat session not initialized')
      }
      await chatSession.sendAndWait({ prompt })
    },

    async sendMonitorPoll(): Promise<void> {
      if (!monitorSession) {
        throw new Error('Monitor session not initialized')
      }
      await monitorSession.sendAndWait({
        prompt:
          'List my meetings for the next 3 hours. Include the time, title, attendees, organizer, join link, and agenda for each. Call report_meetings with all the meetings you find.',
      })
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add session manager with chat and monitor sessions"
```

---

## Task 8: Meeting Monitor (Polling, Cache, Notifications, Lifecycle)

**Files:**
- Create: `src/main/meetings/cache.ts`
- Create: `src/main/meetings/notifications.ts`
- Create: `src/main/meetings/monitor.ts`
- Test: `src/main/__tests__/meeting-cache.test.ts`
- Test: `src/main/__tests__/meeting-notifications.test.ts`

- [ ] **Step 1: Write tests for meeting cache**

`src/main/__tests__/meeting-cache.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createMeetingCache } from '../meetings/cache'
import type { Meeting } from '../types'

function makeMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: '1',
    title: 'Test Meeting',
    startTime: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min from now
    endTime: new Date(Date.now() + 90 * 60_000).toISOString(),
    attendees: ['Alice', 'Bob'],
    organizer: 'Alice',
    ...overrides,
  }
}

describe('MeetingCache', () => {
  let cache: ReturnType<typeof createMeetingCache>

  beforeEach(() => {
    cache = createMeetingCache()
  })

  it('starts empty', () => {
    expect(cache.getAll()).toEqual([])
    expect(cache.getStatus()).toBe('loading')
  })

  it('replaces all meetings on update', () => {
    const meetings = [makeMeeting({ id: '1' }), makeMeeting({ id: '2' })]
    cache.update(meetings)
    expect(cache.getAll()).toHaveLength(2)
    expect(cache.getStatus()).toBe('ready')
  })

  it('returns meetings needing alert within threshold', () => {
    const soon = makeMeeting({
      id: 'soon',
      startTime: new Date(Date.now() + 3 * 60_000).toISOString(), // 3 min from now
    })
    const later = makeMeeting({
      id: 'later',
      startTime: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min
    })
    cache.update([soon, later])

    const needAlert = cache.getMeetingsNeedingAlert(5) // 5 min threshold
    expect(needAlert).toHaveLength(1)
    expect(needAlert[0].id).toBe('soon')
  })

  it('marks a meeting as alerted', () => {
    const meeting = makeMeeting({ id: 'alert-me' })
    cache.update([meeting])
    cache.markAlerted('alert-me')

    const needAlert = cache.getMeetingsNeedingAlert(60) // huge threshold
    expect(needAlert).toHaveLength(0)
  })

  it('removes past meetings on prune', () => {
    const past = makeMeeting({
      id: 'past',
      startTime: new Date(Date.now() - 60 * 60_000).toISOString(),
      endTime: new Date(Date.now() - 30 * 60_000).toISOString(),
    })
    const future = makeMeeting({ id: 'future' })
    cache.update([past, future])
    cache.prune()
    expect(cache.getAll()).toHaveLength(1)
    expect(cache.getAll()[0].id).toBe('future')
  })

  it('sets error status on setError', () => {
    cache.update([makeMeeting()])
    cache.setError()
    expect(cache.getStatus()).toBe('error')
    // meetings still available (stale cache)
    expect(cache.getAll()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/main/__tests__/meeting-cache.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement meeting cache**

`src/main/meetings/cache.ts`:
```typescript
import type { Meeting } from '../types'

export type CacheStatus = 'loading' | 'ready' | 'error'

interface CachedMeeting extends Meeting {
  alerted: boolean
}

export interface MeetingCache {
  getAll(): Meeting[]
  update(meetings: Meeting[]): void
  getMeetingsNeedingAlert(alertMinutes: number): Meeting[]
  markAlerted(id: string): void
  prune(): void
  setError(): void
  getStatus(): CacheStatus
  getCount(): number
}

export function createMeetingCache(): MeetingCache {
  let meetings: CachedMeeting[] = []
  let status: CacheStatus = 'loading'

  return {
    getAll(): Meeting[] {
      return meetings.map(({ alerted: _, ...m }) => m)
    },

    update(newMeetings: Meeting[]): void {
      const alertedIds = new Set(meetings.filter((m) => m.alerted).map((m) => m.id))
      meetings = newMeetings.map((m) => ({
        ...m,
        alerted: alertedIds.has(m.id),
      }))
      status = 'ready'
    },

    getMeetingsNeedingAlert(alertMinutes: number): Meeting[] {
      const now = Date.now()
      const threshold = alertMinutes * 60_000
      return meetings
        .filter((m) => {
          if (m.alerted) return false
          const timeUntil = new Date(m.startTime).getTime() - now
          return timeUntil > 0 && timeUntil <= threshold
        })
        .map(({ alerted: _, ...m }) => m)
    },

    markAlerted(id: string): void {
      const meeting = meetings.find((m) => m.id === id)
      if (meeting) meeting.alerted = true
    },

    prune(): void {
      const now = Date.now()
      meetings = meetings.filter((m) => new Date(m.endTime).getTime() > now)
    },

    setError(): void {
      status = 'error'
    },

    getStatus(): CacheStatus {
      return status
    },

    getCount(): number {
      return meetings.length
    },
  }
}
```

- [ ] **Step 4: Run cache tests**

```bash
npx vitest run src/main/__tests__/meeting-cache.test.ts
```

Expected: PASS

- [ ] **Step 5: Write tests for notification trigger logic**

`src/main/__tests__/meeting-notifications.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(({ title, body }) => ({
    title,
    body,
    show: vi.fn(),
    on: vi.fn(),
  })),
}))

import { fireNotification } from '../meetings/notifications'
import type { Meeting } from '../types'

describe('fireNotification', () => {
  it('creates and shows a notification with meeting info', () => {
    const meeting: Meeting = {
      id: '1',
      title: 'Standup',
      startTime: new Date(Date.now() + 5 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 35 * 60_000).toISOString(),
      attendees: ['Alice', 'Bob'],
      organizer: 'Alice',
    }

    const { notification } = fireNotification(meeting, vi.fn())
    expect(notification.show).toHaveBeenCalled()
    expect(notification.title).toContain('Meeting')
  })
})
```

- [ ] **Step 6: Implement notification trigger**

`src/main/meetings/notifications.ts`:
```typescript
import { Notification } from 'electron'
import type { Meeting } from '../types'

export function fireNotification(
  meeting: Meeting,
  onClickShowOverlay: (meetingId: string) => void
): { notification: Notification } {
  const minutesUntil = Math.round(
    (new Date(meeting.startTime).getTime() - Date.now()) / 60_000
  )
  const timeText = minutesUntil <= 1 ? 'now' : `in ${minutesUntil} min`

  const attendeeText =
    meeting.attendees.length > 0
      ? ` — ${meeting.attendees.slice(0, 3).join(', ')}${meeting.attendees.length > 3 ? '...' : ''}`
      : ''

  const notification = new Notification({
    title: `Meeting ${timeText}`,
    body: `${meeting.title}${attendeeText}`,
  })

  notification.on('click', () => {
    onClickShowOverlay(meeting.id)
  })

  notification.show()
  return { notification }
}
```

- [ ] **Step 7: Run notification tests**

```bash
npx vitest run src/main/__tests__/meeting-notifications.test.ts
```

Expected: PASS

- [ ] **Step 8: Implement meeting monitor**

`src/main/meetings/monitor.ts`:
```typescript
import { powerMonitor } from 'electron'
import { createMeetingCache, type MeetingCache } from './cache'
import { fireNotification } from './notifications'
import type { Meeting } from '../types'
import type { SessionManager } from '../copilot/sessions'

const POLL_INTERVAL_MS = 15 * 60_000 // 15 minutes
const TICK_INTERVAL_MS = 60_000 // 60 seconds

interface MonitorConfig {
  sessionManager: SessionManager
  getAlertMinutes: () => number
  onMeetingsChanged: (meetings: Meeting[]) => void
  onShowOverlay: (meetingId: string) => void
  onBadgeUpdate: (count: number) => void
}

export interface MeetingMonitor {
  start(): void
  stop(): void
  getCache(): MeetingCache
  pollNow(): Promise<void>
}

export function createMeetingMonitor(config: MonitorConfig): MeetingMonitor {
  const cache = createMeetingCache()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let suspended = false

  async function poll(): Promise<void> {
    try {
      await config.sessionManager.sendMonitorPoll()
      // The report_meetings tool handler updates the cache via onMeetings callback
    } catch (err) {
      console.error('[monitor] Poll failed:', err)
      cache.setError()
    }
    config.onBadgeUpdate(cache.getCount())
    config.onMeetingsChanged(cache.getAll())
  }

  function tick(): void {
    if (suspended) return

    cache.prune()

    const alertMinutes = config.getAlertMinutes()
    const needAlert = cache.getMeetingsNeedingAlert(alertMinutes)

    for (const meeting of needAlert) {
      fireNotification(meeting, config.onShowOverlay)
      cache.markAlerted(meeting.id)
    }

    config.onMeetingsChanged(cache.getAll())
    config.onBadgeUpdate(cache.getCount())
  }

  function onResume(): void {
    suspended = false
    console.log('[monitor] System resumed, re-polling')
    poll()
  }

  function onSuspend(): void {
    suspended = true
    console.log('[monitor] System suspending, pausing tick')
  }

  return {
    start(): void {
      // Immediate first poll
      poll()

      pollTimer = setInterval(poll, POLL_INTERVAL_MS)
      tickTimer = setInterval(tick, TICK_INTERVAL_MS)

      powerMonitor.on('resume', onResume)
      powerMonitor.on('suspend', onSuspend)
    },

    stop(): void {
      if (pollTimer) clearInterval(pollTimer)
      if (tickTimer) clearInterval(tickTimer)
      pollTimer = null
      tickTimer = null

      powerMonitor.removeListener('resume', onResume)
      powerMonitor.removeListener('suspend', onSuspend)
    },

    getCache(): MeetingCache {
      return cache
    },

    async pollNow(): Promise<void> {
      await poll()
    },
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add meeting cache, notifications, and background monitor with power lifecycle"
```

---

## Task 9: Meeting Zustand Store + Hook

**Files:**
- Create: `src/renderer/src/stores/meetingStore.ts`
- Create: `src/renderer/src/hooks/useMeetings.ts`
- Test: `src/renderer/src/stores/__tests__/meetingStore.test.ts`

- [ ] **Step 1: Write meeting store test**

`src/renderer/src/stores/__tests__/meetingStore.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useMeetingStore } from '../meetingStore'

describe('meetingStore', () => {
  beforeEach(() => {
    useMeetingStore.setState({
      meetings: [],
      status: 'loading',
      selectedMeetingId: null,
    })
  })

  it('starts in loading state with no meetings', () => {
    const state = useMeetingStore.getState()
    expect(state.meetings).toEqual([])
    expect(state.status).toBe('loading')
  })

  it('setMeetings updates meetings and status', () => {
    useMeetingStore.getState().setMeetings([
      { id: '1', title: 'Test', startTime: '', endTime: '', attendees: [], organizer: '' },
    ])
    const state = useMeetingStore.getState()
    expect(state.meetings).toHaveLength(1)
    expect(state.status).toBe('ready')
  })

  it('selectMeeting sets selectedMeetingId', () => {
    useMeetingStore.getState().selectMeeting('abc')
    expect(useMeetingStore.getState().selectedMeetingId).toBe('abc')
  })

  it('clearSelection resets selectedMeetingId', () => {
    useMeetingStore.getState().selectMeeting('abc')
    useMeetingStore.getState().clearSelection()
    expect(useMeetingStore.getState().selectedMeetingId).toBeNull()
  })
})
```

- [ ] **Step 2: Implement meeting store**

`src/renderer/src/stores/meetingStore.ts`:
```typescript
import { create } from 'zustand'
import type { Meeting } from '../../../main/types'

type MeetingStatus = 'loading' | 'ready' | 'error'

interface MeetingState {
  meetings: Meeting[]
  status: MeetingStatus
  selectedMeetingId: string | null
  setMeetings: (meetings: Meeting[]) => void
  setStatus: (status: MeetingStatus) => void
  selectMeeting: (id: string) => void
  clearSelection: () => void
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  status: 'loading',
  selectedMeetingId: null,

  setMeetings: (meetings) => set({ meetings, status: 'ready' }),
  setStatus: (status) => set({ status }),
  selectMeeting: (id) => set({ selectedMeetingId: id }),
  clearSelection: () => set({ selectedMeetingId: null }),
}))
```

- [ ] **Step 3: Implement useMeetings hook**

`src/renderer/src/hooks/useMeetings.ts`:
```typescript
import { useEffect } from 'react'
import { useMeetingStore } from '../stores/meetingStore'
import { flint } from '../lib/ipc'

export function useMeetings() {
  const { meetings, status, selectedMeetingId, setMeetings, selectMeeting, clearSelection } =
    useMeetingStore()

  useEffect(() => {
    // Load initial meetings
    flint.getMeetings().then((m) => setMeetings(m))

    // Subscribe to updates from main process
    const unsub = flint.onMeetingsUpdate((m) => setMeetings(m))
    return unsub
  }, [setMeetings])

  const selectedMeeting = meetings.find((m) => m.id === selectedMeetingId) ?? null

  return {
    meetings,
    status,
    selectedMeeting,
    selectMeeting,
    clearSelection,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/renderer/src/stores/__tests__/meetingStore.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add meeting Zustand store and useMeetings hook"
```

---

## Task 10: MeetingCards Component

**Files:**
- Create: `src/renderer/src/components/MeetingCards.tsx`
- Create: `src/renderer/src/components/MeetingCards.module.css`

- [ ] **Step 1: Implement MeetingCards**

`src/renderer/src/components/MeetingCards.tsx`:
```tsx
import type { Meeting } from '../../../main/types'
import styles from './MeetingCards.module.css'

interface MeetingCardsProps {
  meetings: Meeting[]
  alertMinutes: number
  onSelect: (id: string) => void
  onJoin: (joinUrl: string) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatTimeUntil(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

export function MeetingCards({ meetings, alertMinutes, onSelect, onJoin }: MeetingCardsProps) {
  if (meetings.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>⚡</span>
        <span className={styles.emptyText}>No upcoming meetings</span>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      <div className={styles.label}>UPCOMING</div>
      {meetings.map((meeting) => {
        const minutesUntil = (new Date(meeting.startTime).getTime() - Date.now()) / 60_000
        const isImminent = minutesUntil <= alertMinutes && minutesUntil > 0

        return (
          <button
            key={meeting.id}
            className={`${styles.card} ${isImminent ? styles.imminent : ''}`}
            onClick={() => onSelect(meeting.id)}
            type="button"
          >
            <div className={styles.time}>
              <div className={styles.timeValue}>{formatTime(meeting.startTime)}</div>
              <div className={styles.timeUntil}>{formatTimeUntil(meeting.startTime)}</div>
            </div>
            <div className={styles.info}>
              <div className={styles.title}>{meeting.title}</div>
              <div className={styles.attendees}>
                {meeting.attendees.slice(0, 3).join(', ')}
                {meeting.attendees.length > 3 ? '...' : ''}
              </div>
            </div>
            {isImminent && meeting.joinUrl && (
              <button
                className={styles.joinButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onJoin(meeting.joinUrl!)
                }}
                type="button"
              >
                Join ↗
              </button>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS module using design tokens**

`src/renderer/src/components/MeetingCards.module.css`:
```css
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
}

.label {
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: var(--space-1);
}

.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: none; /* No transitions on keyboard-driven selection */
}

.card:hover {
  background: var(--color-surface-hover);
}

.card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.imminent {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.2);
}

.time {
  min-width: 44px;
  text-align: center;
}

.timeValue {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--color-text-secondary);
}

.imminent .timeValue {
  color: var(--color-warning);
}

.timeUntil {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
}

.imminent .timeUntil {
  color: var(--color-warning);
  opacity: 0.7;
}

.info {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attendees {
  font-size: var(--font-xs);
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.joinButton {
  background: var(--color-warning);
  color: var(--color-surface);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-xs);
  font-weight: 600;
  cursor: pointer;
  border: none;
  white-space: nowrap;
}

.joinButton:hover {
  opacity: 0.9;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  gap: var(--space-2);
}

.emptyIcon {
  font-size: 24px;
  opacity: 0.4;
}

.emptyText {
  color: var(--color-text-muted);
  font-size: var(--font-sm);
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add MeetingCards component with imminent highlighting"
```

---

## Task 11: MeetingDetail Component

**Files:**
- Create: `src/renderer/src/components/MeetingDetail.tsx`
- Create: `src/renderer/src/components/MeetingDetail.module.css`

- [ ] **Step 1: Implement MeetingDetail**

`src/renderer/src/components/MeetingDetail.tsx`:
```tsx
import type { Meeting } from '../../../main/types'
import styles from './MeetingDetail.module.css'

interface MeetingDetailProps {
  meeting: Meeting
  onBack: () => void
  onJoin: (joinUrl: string) => void
}

export function MeetingDetail({ meeting, onBack, onJoin }: MeetingDetailProps) {
  const minutesUntil = Math.round(
    (new Date(meeting.startTime).getTime() - Date.now()) / 60_000
  )
  const statusText = minutesUntil <= 0 ? 'STARTING NOW' : `in ${minutesUntil} min`
  const isNow = minutesUntil <= 0

  const startFormatted = new Date(meeting.startTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endFormatted = new Date(meeting.endTime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className={styles.container}>
      <button className={styles.backButton} onClick={onBack} type="button">
        ← back
      </button>

      <div className={styles.status}>
        <div className={`${styles.dot} ${isNow ? styles.dotPulse : ''}`} />
        <span className={styles.statusText}>{statusText}</span>
      </div>

      <h2 className={styles.title}>{meeting.title}</h2>
      <div className={styles.timeRange}>
        {startFormatted} – {endFormatted}
      </div>

      <div className={styles.details}>
        <div className={styles.section}>
          <div className={styles.sectionLabel}>ATTENDEES</div>
          <div className={styles.sectionContent}>
            {meeting.attendees.map((a, i) => (
              <div key={i}>
                {a}
                {a === meeting.organizer ? ' (organizer)' : ''}
              </div>
            ))}
          </div>
        </div>

        {meeting.agenda && (
          <div className={styles.section}>
            <div className={styles.sectionLabel}>AGENDA</div>
            <div className={styles.sectionContent}>{meeting.agenda}</div>
          </div>
        )}
      </div>

      {meeting.joinUrl && (
        <button
          className={styles.joinButton}
          onClick={() => onJoin(meeting.joinUrl!)}
          type="button"
        >
          Join Meeting ↗
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CSS module**

`src/renderer/src/components/MeetingDetail.module.css`:
```css
.container {
  padding: var(--space-4);
}

.backButton {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  cursor: pointer;
  padding: 0;
  margin-bottom: var(--space-3);
}

.backButton:hover {
  color: var(--color-text-secondary);
}

.status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-warning);
}

.dotPulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.statusText {
  color: var(--color-warning);
  font-size: var(--font-xs);
  font-weight: 600;
}

.title {
  color: var(--color-text-primary);
  font-size: var(--font-lg);
  font-weight: 600;
  margin: 0 0 var(--space-1) 0;
}

.timeRange {
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  margin-bottom: var(--space-4);
}

.details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.section {}

.sectionLabel {
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.sectionContent {
  color: var(--color-text-secondary);
  font-size: var(--font-xs);
  line-height: 1.6;
}

.joinButton {
  width: 100%;
  background: var(--color-warning);
  color: var(--color-surface);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--font-sm);
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-align: center;
}

.joinButton:hover {
  opacity: 0.9;
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add MeetingDetail component with attendees and join button"
```

---

## Task 12: Chat Store + Hook (Adapted)

**Files:**
- Create: `src/renderer/src/stores/chatStore.ts`
- Create: `src/renderer/src/hooks/useChat.ts`

- [ ] **Step 1: Implement chat store**

`src/renderer/src/stores/chatStore.ts`:
```typescript
import { create } from 'zustand'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatState {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
  addUserMessage: (content: string) => void
  appendDelta: (delta: string) => void
  finishStreaming: () => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streamingContent: '',
  isStreaming: false,

  addUserMessage: (content) =>
    set((state) => ({
      messages: [...state.messages, { role: 'user', content }],
      streamingContent: '',
      isStreaming: true,
    })),

  appendDelta: (delta) =>
    set((state) => ({
      streamingContent: state.streamingContent + delta,
    })),

  finishStreaming: () =>
    set((state) => ({
      messages: [
        ...state.messages,
        { role: 'assistant', content: state.streamingContent },
      ],
      streamingContent: '',
      isStreaming: false,
    })),

  clearMessages: () => set({ messages: [], streamingContent: '', isStreaming: false }),
}))
```

- [ ] **Step 2: Implement useChat hook**

`src/renderer/src/hooks/useChat.ts`:
```typescript
import { useEffect, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { flint } from '../lib/ipc'

export function useChat() {
  const { messages, streamingContent, isStreaming, addUserMessage, appendDelta, finishStreaming, clearMessages } =
    useChatStore()

  useEffect(() => {
    const unsubDelta = flint.onChatDelta((delta) => appendDelta(delta))
    const unsubDone = flint.onChatDone(() => finishStreaming())

    return () => {
      unsubDelta()
      unsubDone()
    }
  }, [appendDelta, finishStreaming])

  const sendMessage = useCallback(
    (prompt: string) => {
      if (!prompt.trim() || isStreaming) return
      addUserMessage(prompt)
      flint.chatSend(prompt)
    },
    [addUserMessage, isStreaming]
  )

  return {
    messages,
    streamingContent,
    isStreaming,
    sendMessage,
    clearMessages,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add chat store and useChat hook with streaming support"
```

---

## Task 13: ChatInput + ChatPanel Components

**Files:**
- Create: `src/renderer/src/components/ChatInput.tsx`
- Create: `src/renderer/src/components/ChatInput.module.css`
- Adapt: `src/renderer/src/components/ChatPanel.tsx` (rewrite for new architecture)
- Adapt: `src/renderer/src/components/ChatPanel.module.css`

- [ ] **Step 1: Create ChatInput component**

`src/renderer/src/components/ChatInput.tsx`:
```tsx
import { useState, useCallback, type KeyboardEvent } from 'react'
import styles from './ChatInput.module.css'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled, placeholder = 'Ask about your schedule...' }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className={styles.container}>
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus
      />
      <span className={styles.hint}>⏎</span>
    </div>
  )
}
```

`src/renderer/src/components/ChatInput.module.css`:
```css
.container {
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.input {
  flex: 1;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-primary);
  font-size: var(--font-sm);
  outline: none;
}

.input::placeholder {
  color: var(--color-text-muted);
}

.input:focus {
  border-color: var(--color-accent);
}

.hint {
  color: var(--color-text-muted);
  font-size: var(--font-xs);
  opacity: 0.5;
}
```

- [ ] **Step 2: Rewrite ChatPanel for new architecture**

`src/renderer/src/components/ChatPanel.tsx`:
```tsx
import styles from './ChatPanel.module.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
}

export function ChatPanel({ messages, streamingContent, isStreaming }: ChatPanelProps) {
  if (messages.length === 0 && !isStreaming) return null

  return (
    <div className={styles.panel}>
      {messages.map((msg, i) => (
        <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
          <div className={styles.content}>{msg.content}</div>
        </div>
      ))}
      {isStreaming && streamingContent && (
        <div className={`${styles.message} ${styles.assistant}`}>
          <div className={styles.content}>{streamingContent}</div>
        </div>
      )}
    </div>
  )
}
```

`src/renderer/src/components/ChatPanel.module.css`:
```css
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  max-height: 200px;
}

.message {
  font-size: var(--font-sm);
  line-height: 1.5;
}

.user .content {
  color: var(--color-text-primary);
  font-weight: 500;
}

.assistant .content {
  color: var(--color-text-secondary);
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add ChatInput and rewrite ChatPanel for Copilot SDK streaming"
```

---

## Task 14: App Root Component

**Files:**
- Rewrite: `src/renderer/src/App.tsx`

- [ ] **Step 1: Implement App root with view routing**

`src/renderer/src/App.tsx`:
```tsx
import { useMeetings } from './hooks/useMeetings'
import { useChat } from './hooks/useChat'
import { MeetingCards } from './components/MeetingCards'
import { MeetingDetail } from './components/MeetingDetail'
import { ChatPanel } from './components/ChatPanel'
import { ChatInput } from './components/ChatInput'
import { flint } from './lib/ipc'
import './styles/global.css'

export default function App() {
  const { meetings, status, selectedMeeting, selectMeeting, clearSelection } = useMeetings()
  const { messages, streamingContent, isStreaming, sendMessage } = useChat()

  const handleJoin = (joinUrl: string): void => {
    flint.joinMeeting(joinUrl)
    flint.hideOverlay()
  }

  // Meeting detail view
  if (selectedMeeting) {
    return (
      <div data-testid="app-root">
        <MeetingDetail
          meeting={selectedMeeting}
          onBack={clearSelection}
          onJoin={handleJoin}
        />
        <div style={{ height: 1, background: 'var(--color-border)', margin: '0 var(--space-4)' }} />
        <ChatPanel
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
        />
        <ChatInput
          onSend={sendMessage}
          disabled={isStreaming}
          placeholder="Ask about this meeting..."
        />
      </div>
    )
  }

  // Default view
  return (
    <div data-testid="app-root">
      <header style={{ padding: 'var(--space-3) var(--space-4) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 14 }}>⚡</span>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-xs)', fontWeight: 600, letterSpacing: '0.5px' }}>
          FLINT
        </span>
      </header>

      {status === 'loading' && (
        <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
          Checking your calendar...
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)' }}>
          Couldn't reach your calendar. Retrying...
        </div>
      )}

      {status === 'ready' && (
        <MeetingCards
          meetings={meetings}
          alertMinutes={5}
          onSelect={selectMeeting}
          onJoin={handleJoin}
        />
      )}

      <div style={{ height: 1, background: 'var(--color-border)', margin: '0 var(--space-4)' }} />

      <ChatPanel
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
```

- [ ] **Step 2: Update renderer entry to use App**

`src/renderer/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add App root component with meeting cards, detail view, and chat"
```

---

## Task 15: Wire Main Process End-to-End

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/handlers.ts`

- [ ] **Step 1: Wire everything together in main process**

Replace `src/main/index.ts`:
```typescript
import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createOverlayWindow, showOverlay, getOverlayWindow } from './window/overlay'
import { createTray, updateTrayBadge } from './window/tray'
import { registerHotkey, unregisterAllHotkeys } from './window/hotkey'
import { registerIpcHandlers, getConfigStore } from './ipc/handlers'
import { createCopilotManager } from './copilot/client'
import { createSessionManager } from './copilot/sessions'
import { createMeetingMonitor } from './meetings/monitor'
import { IPC_CHANNELS } from './ipc/channels'

const copilotManager = createCopilotManager()
let monitor: ReturnType<typeof createMeetingMonitor> | null = null

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('sh.oribi.flint')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const config = getConfigStore().getAll()
  const overlayWindow = createOverlayWindow()
  createTray()
  registerHotkey(config.hotkey)

  // Start Copilot
  try {
    await copilotManager.start()
    const client = copilotManager.getClient()!

    const sessionManager = createSessionManager({
      client,
      onMeetings: (meetings) => {
        monitor?.getCache().update(meetings)
        const overlay = getOverlayWindow()
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send(IPC_CHANNELS.MEETINGS_UPDATE, meetings)
        }
      },
      onShowOverlay: (meetingId) => showOverlay(meetingId),
      getMeetings: () => monitor?.getCache().getAll() ?? [],
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

    await sessionManager.initSessions()

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

    // Wire chat:send IPC to session manager
    const { ipcMain } = await import('electron')
    ipcMain.on(IPC_CHANNELS.CHAT_SEND, async (_event, prompt: string) => {
      try {
        await sessionManager.sendChatMessage(prompt)
      } catch (err) {
        console.error('[chat] Failed to send message:', err)
      }
    })

    // Wire meetings:get to cache
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

  // Surface copilot status changes
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

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
```

- [ ] **Step 2: Verify the full app launches**

```bash
npm run dev
```

Expected: App launches, tray icon appears, overlay shows on hotkey. If Copilot CLI is authenticated, the monitor starts polling. Meeting cards render when data arrives. Chat input sends messages and streams responses.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: wire main process end-to-end (copilot, monitor, sessions, IPC)"
```

---

## Task 16: E2E Test Setup

**Files:**
- Create: `tests/e2e/app.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright with Electron support**

```bash
npm install --save-dev @playwright/test
npx playwright install
```

- [ ] **Step 2: Create Playwright config for Electron**

`playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
})
```

- [ ] **Step 3: Create basic E2E test**

`tests/e2e/app.spec.ts`:
```typescript
import { test, expect, _electron as electron } from '@playwright/test'

test.describe('Flint Overlay', () => {
  test('app launches and shows overlay', async () => {
    const app = await electron.launch({ args: ['./out/main/index.js'] })
    const window = await app.firstWindow()

    // Wait for the app to render
    await window.waitForSelector('[data-testid="app-root"]', { timeout: 10_000 })

    // Check that the Flint header is visible
    const header = await window.textContent('header')
    expect(header).toContain('FLINT')

    await app.close()
  })
})
```

- [ ] **Step 4: Add E2E test script to package.json**

```json
{
  "scripts": {
    "test:e2e": "electron-vite build && npx playwright test"
  }
}
```

- [ ] **Step 5: Run E2E test**

```bash
npm run test:e2e
```

Expected: Build succeeds, Electron launches, test finds the app root and FLINT header, test passes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Playwright E2E test setup with Electron support"
```

---

## Task 17: Update justfile and AGENTS.md

**Files:**
- Modify: `justfile`
- Modify: `AGENTS.md`

- [ ] **Step 1: Rewrite justfile for Electron workflow**

```justfile
# Flint — Desktop Personal Assistant

# List all recipes
default:
    @just --list

# Dev mode with hot reload
dev:
    npm run dev

# Build everything
build:
    npm run build

# Run all tests
test: test-unit test-e2e

# Unit tests
test-unit:
    npx vitest run

# E2E tests (builds first)
test-e2e:
    npm run test:e2e

# Type checking
typecheck:
    npm run typecheck

# Lint
lint:
    npx eslint 'src/**/*.{ts,tsx}'

# Format check
format:
    npx prettier --check 'src/**/*.{ts,tsx,css}'

# Full check (lint + format + typecheck + test)
check: lint format typecheck test

# Package for macOS
package-mac:
    npm run build:mac
```

- [ ] **Step 2: Update AGENTS.md for new architecture**

Replace the Tech Stack, Architecture, Commands, Rust Conventions, and Tauri sections. Keep the Engineering Principles, Git, and Testing sections. Update to reflect Electron + TypeScript throughout. Remove references to Rust, Tauri, Cargo, nucleo, Spotlight, kits.

Key changes:
- Tech stack: Electron, TypeScript, React 19, Zustand, Copilot SDK, Work IQ, electron-vite
- Architecture: Electron main + renderer, Copilot SDK in main, IPC bridge
- Commands: just recipes from the updated justfile
- Remove: Rust Conventions, Tauri v2 Patterns, Cross-Platform (Rust-specific)
- Update: TypeScript/React conventions to cover main process code too

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: update justfile and AGENTS.md for Electron architecture"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ Architecture (Electron + TS SDK) — Task 1
   - ✅ Build pipeline (electron-vite) — Task 1
   - ✅ Tool scoping / onPermissionRequest — Task 7
   - ✅ Client initialization — Task 5
   - ✅ Two sessions (chat + monitor) — Task 7
   - ✅ MCP integration (Work IQ on monitor only) — Task 7
   - ✅ Custom tools (report_meetings, get_meetings, notify, join, overlay) — Task 6
   - ✅ Streaming to renderer — Task 7, 15
   - ✅ Session persistence — Task 7
   - ✅ Auth (noted, one-time setup) — referenced in sessions
   - ✅ Background polling — Task 8
   - ✅ System lifecycle (sleep/wake) — Task 8
   - ✅ Meeting cache — Task 8
   - ✅ Native notifications — Task 8
   - ✅ Overlay window (frameless, transparent, always-on-top) — Task 4
   - ✅ Tray icon with badge — Task 4
   - ✅ Global hotkey — Task 4
   - ✅ Default view (meeting cards + chat) — Task 10, 14
   - ✅ Meeting detail view — Task 11, 14
   - ✅ Loading/empty/error states — Task 10, 14
   - ✅ Chat interaction — Task 12, 13
   - ✅ Settings / config — Task 3
   - ✅ IPC contract — Task 2
   - ✅ Repo transformation (remove/keep/add) — Task 1
   - ✅ Testing strategy (unit + E2E) — Task 8, 9, 16

2. **No placeholders found.**

3. **Type consistency:** `Meeting` type defined in Task 2, used consistently. `FlintConfig` defined in Task 2, used in Task 3. `ConnectionStatus` defined in Task 2, used in Task 5.
