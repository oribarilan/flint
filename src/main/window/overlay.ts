import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { getTray } from "./tray";

const POPOVER_WIDTH = 360;
const POPOVER_HEIGHT = 600;

let overlayWindow: BrowserWindow | null = null;

export function createOverlayWindow(): BrowserWindow {
  overlayWindow = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
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

  // On macOS, transparent: true already makes fully-transparent regions click-through.
  // The pill's glass background keeps it interactive. No setIgnoreMouseEvents needed.

  overlayWindow.on("blur", () => {
    hideOverlay();
  });

  return overlayWindow;
}

/** Position the popover on the active display (where the cursor is). */
function positionOnActiveDisplay(): void {
  if (!overlayWindow) return;

  const cursor = screen.getCursorScreenPoint();
  const activeDisplay = screen.getDisplayNearestPoint(cursor);
  const { workArea } = activeDisplay;
  const windowBounds = overlayWindow.getBounds();

  // If the tray is on the active display, anchor the popover to it
  const tray = getTray();
  if (tray) {
    const trayBounds = tray.getBounds();
    const trayDisplay = screen.getDisplayNearestPoint({
      x: trayBounds.x,
      y: trayBounds.y,
    });
    if (trayDisplay.id === activeDisplay.id) {
      const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width + 12);
      const y = Math.round(trayBounds.y + trayBounds.height + 4);
      overlayWindow.setPosition(x, y);
      return;
    }
  }

  // Fallback: top-right of active display
  const x = workArea.x + workArea.width - windowBounds.width - 8;
  const y = workArea.y + 4;
  overlayWindow.setPosition(x, y);
}

export function showOverlay(): void {
  if (!overlayWindow) return;
  positionOnActiveDisplay();
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
