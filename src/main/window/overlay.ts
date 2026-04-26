import { BrowserWindow } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";

let overlayWindow: BrowserWindow | null = null;

export function createOverlayWindow(): BrowserWindow {
  overlayWindow = new BrowserWindow({
    width: 1032,
    height: 520,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
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

export function showOverlay(): void {
  if (!overlayWindow) return;
  overlayWindow.center();
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
