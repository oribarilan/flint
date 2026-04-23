import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { showOverlay } from './overlay'

let tray: Tray | null = null

export function createTray(): Tray {
  const iconPath = join(__dirname, '../../resources/trayTemplate.png')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
  } catch {
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
