import { execSync } from "child_process";
import { app, ipcMain, nativeTheme } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { createOverlayWindow, getOverlayWindow } from "./window/overlay";
import { showSettingsWindow, getSettingsWindow } from "./window/settings-window";
import { showSpotlight, registerSpotlightHandlers, getSpotlightWindow } from "./window/spotlight-window";
import { createTray, updateTrayMeetings, updateTrayTitle } from "./window/tray";
import { registerHotkey, unregisterAllHotkeys } from "./window/hotkey";
import { registerIpcHandlers, getConfigStore, getAttentionStore } from "./ipc/handlers";
import { IPC_CHANNELS } from "./ipc/channels";
import { createCopilotManager, type CopilotManager } from "./copilot/client";
import { createSessionManager, type SessionManager } from "./copilot/sessions";
import { getChatTools } from "./copilot/tools";
import { filterModels, handleSetModel } from "./ipc/model-handlers";
import { createMeetingScheduler, type MeetingScheduler } from "./scheduler/meeting-scheduler";
import { createAgencyCalendarSource, type AgencyCalendarSource } from "./calendar/agency-calendar";
import { resolveTheme } from "./theme";
import { ChatSendPromptSchema } from "./lib/schemas";
import { openExternalUrl } from "./lib/url";
import type { FlintConfig, Meeting } from "./types";

let latestMeetings: Meeting[] = [];
let copilotManager: CopilotManager | null = null;
let sessionManager: SessionManager | null = null;
let meetingScheduler: MeetingScheduler | null = null;
let agencyCalendar: AgencyCalendarSource | null = null;

/** Resolve the Copilot CLI binary path using env → PATH → macOS fallback. */
function resolveCopilotCliPath(): string | undefined {
  // 1. Explicit env var
  if (process.env.COPILOT_CLI_PATH) {
    console.log("[main] Using COPILOT_CLI_PATH:", process.env.COPILOT_CLI_PATH);
    return process.env.COPILOT_CLI_PATH;
  }

  // 2. PATH lookup via `which`
  try {
    const resolved = execSync("which copilot", { encoding: "utf-8" }).trim();
    if (resolved) {
      console.log("[main] Found copilot in PATH:", resolved);
      return resolved;
    }
  } catch {
    // `which` failed — not in PATH
  }

  // 3. macOS Homebrew fallback
  if (process.platform === "darwin") {
    console.log("[main] Using macOS fallback: /opt/homebrew/bin/copilot");
    return "/opt/homebrew/bin/copilot";
  }

  // Let the SDK handle resolution
  return undefined;
}

void app.whenReady().then(async () => {
  electronApp.setAppUserModelId("sh.oribi.flint");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  registerSpotlightHandlers();

  const configStore = getConfigStore();
  const config = configStore.getAll();
  createOverlayWindow();

  const openSettings = (): void => {
    const isNew = !getSettingsWindow() || getSettingsWindow()?.isDestroyed();
    const win = showSettingsWindow();
    if (isNew) {
      win.webContents.on("did-finish-load", () => {
        const theme = resolveTheme(configStore.getAll().theme);
        win.webContents.send(IPC_CHANNELS.THEME_CHANGED, theme);
      });
    }
  };

  createTray({ onShowSettings: openSettings });
  registerHotkey(config.hotkey);

  // ── Theme IPC ──
  const sendThemeToRenderer = (theme: string): void => {
    for (const win of [getOverlayWindow(), getSettingsWindow(), getSpotlightWindow()]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.THEME_CHANGED, theme);
      }
    }
  };

  // Send initial theme after window is ready
  const overlay = getOverlayWindow();
  if (overlay) {
    overlay.webContents.on("did-finish-load", () => {
      sendThemeToRenderer(resolveTheme(configStore.getAll().theme));
    });
  }

  // Listen for OS theme changes (only matters when config is "system")
  nativeTheme.on("updated", () => {
    const currentConfig = configStore.getAll();
    if (currentConfig.theme === "system") {
      sendThemeToRenderer(resolveTheme("system"));
    }
  });

  // Push theme to renderer when config changes
  ipcMain.on(IPC_CHANNELS.CONFIG_SET, (_event, partial: Partial<FlintConfig>) => {
    if ("theme" in partial) {
      const resolved = resolveTheme(configStore.getAll().theme);
      sendThemeToRenderer(resolved);
    }
    if ("menubarEnabled" in partial || "menubarTime" in partial || "menubarTitle" in partial) {
      updateTrayTitle(latestMeetings, configStore.getAll());
    }
  });

  // ── Agency Calendar ──
  agencyCalendar = createAgencyCalendarSource();
  const calendarStartPromise = agencyCalendar.start();

  // ── Copilot lifecycle ──
  const cliPath = resolveCopilotCliPath();
  copilotManager = createCopilotManager(cliPath);

  // Wire connection:status IPC
  copilotManager.onStatusChange((status) => {
    const overlay = getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send(IPC_CHANNELS.CONNECTION_STATUS, status);
    }
  });

  try {
    copilotManager.start();
  } catch (err) {
    console.error("[main] CopilotManager failed to start:", err);
    return;
  }

  const client = copilotManager.getClient();
  if (!client) {
    console.error("[main] No CopilotClient after start");
    return;
  }

  // ── Chat tools ──
  const chatTools = getChatTools({
    onShowOverlay: () => {
      const win = getOverlayWindow();
      if (win && !win.isDestroyed()) win.show();
    },
    onAttentionUpdate: (items) => {
      const store = getAttentionStore();
      store.setItems(items);
      const win = getOverlayWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.ATTENTION_UPDATE, items);
      }
    },
  });

  // ── Session manager ──
  sessionManager = createSessionManager({
    client,
    getModel: () => configStore.getAll().model,
    chatTools,
    onChatDelta: (delta) => {
      const overlay = getOverlayWindow();
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send(IPC_CHANNELS.CHAT_DELTA, delta);
      }
    },
    onChatDone: () => {
      const overlay = getOverlayWindow();
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send(IPC_CHANNELS.CHAT_DONE);
      }
    },
    onChatError: (error) => {
      const overlay = getOverlayWindow();
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send(IPC_CHANNELS.CHAT_DELTA, `\n⚠️ Error: ${error}`);
        overlay.webContents.send(IPC_CHANNELS.CHAT_DONE);
      }
    },
  });

  // ── IPC: chat ──
  ipcMain.on(IPC_CHANNELS.CHAT_SEND, (_event, prompt: unknown) => {
    const parsed = ChatSendPromptSchema.safeParse(prompt);
    if (!parsed.success) {
      console.warn("[ipc] chat:send rejected:", parsed.error.issues[0]?.message ?? "invalid");
      return;
    }
    void (async () => {
      if (!sessionManager) return;
      await sessionManager.sendChatMessage(parsed.data);
    })();
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_RESET, async () => {
    if (!sessionManager) return;
    await sessionManager.resetChat();
  });

  // ── IPC: models ──
  ipcMain.handle(IPC_CHANNELS.MODEL_LIST, async () => {
    const c = copilotManager?.getClient();
    if (!c) return [];
    try {
      const models = await c.listModels();
      return filterModels(models);
    } catch (err) {
      console.error("[main] model:list error:", err);
      return [];
    }
  });

  ipcMain.on(IPC_CHANNELS.MODEL_SET, (_event, modelId: string) => {
    void (async () => {
      try {
        await handleSetModel(modelId, {
          session: sessionManager?.getChatSession() ?? null,
          configStore,
          sendToRenderer: (id) => {
            const overlay = getOverlayWindow();
            if (overlay && !overlay.isDestroyed()) {
              overlay.webContents.send(IPC_CHANNELS.MODEL_CHANGED, id);
            }
          },
        });
      } catch (err) {
        console.error("[main] model:set error:", err);
      }
    })();
  });

  // ── Meeting scheduler (deterministic, no LLM) ──
  // Wait for calendar to be ready before starting the scheduler
  await calendarStartPromise;
  meetingScheduler = createMeetingScheduler({
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- agencyCalendar is set above in the same async flow
    fetchUpcomingMeetings: () => agencyCalendar!.fetchTodayMeetings(),
    getAlertMinutes: () => configStore.getAll().alertMinutes,
    getSpotlightMinutes: () => {
      const cfg = configStore.getAll();
      return cfg.spotlightEnabled ? cfg.spotlightMinutes : null;
    },
    onSpotlight: (meeting) => {
      showSpotlight(meeting);
    },
    onMeetingsUpdated: (meetings) => {
      latestMeetings = meetings;
      updateTrayMeetings(meetings, {
        onJoin: (url) => openExternalUrl(url),
        onShowSettings: openSettings,
      });
      updateTrayTitle(meetings, configStore.getAll());
    },
  });
  meetingScheduler.start();

  console.log("[main] Ready — chat wired with CopilotManager + SessionManager");
});

app.on("will-quit", () => {
  void (async () => {
    unregisterAllHotkeys();
    if (meetingScheduler) {
      meetingScheduler.stop();
    }
    if (agencyCalendar) {
      agencyCalendar.stop();
    }
    if (copilotManager) {
      await copilotManager.stop();
    }
  })();
});

app.on("window-all-closed", () => {
  // Keep app running in tray
});
