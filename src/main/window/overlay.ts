import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { getTray } from "./tray";

const POPOVER_WIDTH = 340;
const POPOVER_HEIGHT = 480;

let overlayWindow: BrowserWindow | null = null;

export function createOverlayWindow(): BrowserWindow {
  overlayWindow = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void overlayWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void overlayWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  overlayWindow.on("blur", () => {
    hideOverlay();
  });

  return overlayWindow;
}

/** Position the popover below the tray icon, aligned to the right edge. */
function positionNearTray(): void {
  if (!overlayWindow) return;

  const tray = getTray();
  const windowBounds = overlayWindow.getBounds();

  if (tray) {
    const trayBounds = tray.getBounds();
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width + 12);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    overlayWindow.setPosition(x, y);
  } else {
    // Fallback: top-right of primary display
    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - windowBounds.width - 8;
    const y = workArea.y + 4;
    overlayWindow.setPosition(x, y);
  }
}

export function showOverlay(): void {
  if (!overlayWindow) return;
  positionNearTray();
  overlayWindow.show();
  overlayWindow.focus();
}

export function hideOverlay(): void {
  if (!overlayWindow?.isVisible()) return;
  overlayWindow.hide();
}

export function toggleOverlay(): void {
  if (!overlayWindow) return;
  if (overlayWindow.isVisible()) {
    hideOverlay();
  } else {
    showOverlay();
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}
