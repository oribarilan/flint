import { BrowserWindow, screen, ipcMain } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { IPC_CHANNELS } from "../ipc/channels";
import { openExternalUrl } from "../lib/url";
import { getPrepData } from "../heartbeat/prep-cache";
import type { Meeting } from "../types";

let spotlightWindow: BrowserWindow | null = null;

export interface SpotlightOptions {
  showPrep: boolean;
}

/** Show the spotlight overlay for a meeting. Singleton — dismisses existing before showing new. */
export function showSpotlight(meeting: Meeting, options: SpotlightOptions): void {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) {
    spotlightWindow.close();
    spotlightWindow = null;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.bounds;

  spotlightWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  // On macOS, ensure the window is above the menubar
  if (process.platform === "darwin") {
    spotlightWindow.setAlwaysOnTop(true, "screen-saver");
  }

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void spotlightWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=spotlight`);
  } else {
    void spotlightWindow.loadFile(join(__dirname, "../renderer/index.html"), {
      query: { view: "spotlight" },
    });
  }

  spotlightWindow.webContents.on("did-finish-load", () => {
    if (spotlightWindow && !spotlightWindow.isDestroyed()) {
      const prepItems = options.showPrep ? getPrepData(meeting.id) : null;
      spotlightWindow.webContents.send(IPC_CHANNELS.SPOTLIGHT_SHOW, {
        meeting,
        prepItems,
      });
    }
  });

  spotlightWindow.once("ready-to-show", () => {
    spotlightWindow?.show();
  });

  spotlightWindow.on("closed", () => {
    spotlightWindow = null;
  });
}

export function dismissSpotlight(): void {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) {
    spotlightWindow.close();
  }
  spotlightWindow = null;
}

export function getSpotlightWindow(): BrowserWindow | null {
  return spotlightWindow;
}

/** Register IPC handlers for spotlight actions. Call once at startup. */
export function registerSpotlightHandlers(): void {
  ipcMain.on(IPC_CHANNELS.SPOTLIGHT_DISMISS, () => {
    dismissSpotlight();
  });

  ipcMain.on(IPC_CHANNELS.SPOTLIGHT_JOIN, (_event, joinUrl: string) => {
    if (typeof joinUrl === "string" && joinUrl.length > 0) {
      openExternalUrl(joinUrl);
    }
    dismissSpotlight();
  });
}
