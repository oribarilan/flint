import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";

const MIN_SETTINGS_WIDTH = 600;
const MIN_SETTINGS_HEIGHT = 480;
const DISPLAY_WIDTH_RATIO = 0.4;
const DISPLAY_HEIGHT_RATIO = 0.6;

let settingsWindow: BrowserWindow | null = null;

/** Open the settings window. Singleton — focuses the existing one if already open. */
export function showSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const width = Math.max(MIN_SETTINGS_WIDTH, Math.round(workArea.width * DISPLAY_WIDTH_RATIO));
  const height = Math.max(MIN_SETTINGS_HEIGHT, Math.round(workArea.height * DISPLAY_HEIGHT_RATIO));
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);

  settingsWindow = new BrowserWindow({
    width,
    height,
    minWidth: MIN_SETTINGS_WIDTH,
    minHeight: MIN_SETTINGS_HEIGHT,
    x,
    y,
    show: false,
    resizable: true,
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
