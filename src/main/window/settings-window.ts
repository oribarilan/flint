import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";

const SETTINGS_WIDTH = 660;
const SETTINGS_HEIGHT = 520;

let settingsWindow: BrowserWindow | null = null;

/** Open the settings window. Singleton — focuses the existing one if already open. */
export function showSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const x = Math.round(workArea.x + (workArea.width - SETTINGS_WIDTH) / 2);
  const y = Math.round(workArea.y + (workArea.height - SETTINGS_HEIGHT) / 2);

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    x,
    y,
    show: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: "Flint Settings",
    backgroundColor: "#1d1b1a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=settings`);
  } else {
    void settingsWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { view: "settings" },
    });
  }

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
