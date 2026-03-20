/// <reference types="vite/client" />

/**
 * Simulator mock layer for Tauri APIs.
 *
 * Patches `window.__TAURI_INTERNALS__` before the app loads so that all
 * Tauri IPC calls (`invoke`, `listen`, `emit`) are intercepted. The real
 * `@tauri-apps/api` packages read from this global, so no Vite aliases needed.
 *
 * Two modes controlled by Vite's `--mode` flag:
 * - **dev** (default): OpenCode commands proxy to a real server via Vite dev proxy.
 * - **test** (`--mode test`): All commands use deterministic mocks for E2E automation.
 *
 * Exposes `window.__sim` for programmatic control from Playwright tests.
 */

import type { SimState, CommandHandlerMap } from "./types";
import { DEFAULT_CONFIG, createPlatformHandlers } from "./mock-platform";
import { createMockOpenCodeHandlers } from "./mock-opencode";
import { createProxyHandlers, shutdownProxy } from "./opencode-proxy";

interface SimulatorGlobal {
  __TAURI_INTERNALS__: {
    invoke: typeof invoke;
    transformCallback: typeof transformCallback;
    convertFileSrc: (path: string) => string;
    unregisterCallback: (id: number) => void;
    metadata: {
      currentWindow: { label: string };
      currentWebview: { label: string };
    };
  };
  __TAURI_EVENT_PLUGIN_INTERNALS__: {
    unregisterListener: (event: string, eventId: number) => void;
  };
  __sim: {
    emit: typeof emitToListeners;
    state: SimState;
    getState: () => SimState;
    setConnected: (connected: boolean) => void;
    setAutoReconnectOnInit: (enabled: boolean) => void;
    setHasModel: (hasModel: boolean) => void;
    setRepoPath: (path: string) => void;
    shutdown: typeof shutdownProxy;
    mode: "dev" | "test";
  };
}

const simWindow = window as unknown as Window & SimulatorGlobal;

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

const SIM_MODE: "dev" | "test" = import.meta.env.MODE === "test" ? "test" : "dev";

const SIM_OVERRIDES_KEY = "flint:sim:overrides";
const DEFAULT_PROJECT_MODEL = "anthropic/claude-sonnet-4";

type SimOverrides = {
  connected?: boolean;
  autoReconnectOnInit?: boolean;
  hasModel?: boolean;
  repoPath?: string;
};

function readSimOverrides(): SimOverrides {
  if (SIM_MODE !== "test") return {};
  try {
    const raw = window.sessionStorage.getItem(SIM_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SimOverrides;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeSimOverrides(patch: SimOverrides): void {
  if (SIM_MODE !== "test") return;
  const current = readSimOverrides();
  const next = { ...current, ...patch };
  window.sessionStorage.setItem(SIM_OVERRIDES_KEY, JSON.stringify(next));
}

// ---------------------------------------------------------------------------
// Event system — mirrors Tauri's event infrastructure
// ---------------------------------------------------------------------------

type EventHandler = (event: { event: string; id: number; payload: unknown }) => void;

let nextCallbackId = 1;
const callbacks = new Map<number, EventHandler>();
const eventListeners = new Map<string, Set<number>>();

function unregisterEventHandler(handlerId: number): void {
  callbacks.delete(handlerId);
  for (const [event, listeners] of eventListeners.entries()) {
    listeners.delete(handlerId);
    if (listeners.size === 0) {
      eventListeners.delete(event);
    }
  }
}

function transformCallback(callback: EventHandler, _once?: boolean): number {
  const id = nextCallbackId++;
  callbacks.set(id, callback);
  return id;
}

function emitToListeners(event: string, payload: unknown): void {
  const listenerIds = eventListeners.get(event);
  if (!listenerIds) return;
  for (const id of listenerIds) {
    const cb = callbacks.get(id);
    if (cb) cb({ event, id, payload });
  }
}

// ---------------------------------------------------------------------------
// Simulator state
// ---------------------------------------------------------------------------

const state: SimState = {
  config: structuredClone(DEFAULT_CONFIG),
  chatStatus: {
    connected: true,
    session_id: SIM_MODE === "test" ? "sim-session-001" : null,
    repo_path: SIM_MODE === "test" ? "/mock/second-brain" : null,
  },
  isStreaming: false,
  opencode: {
    autoReconnectOnInit: true,
    nextSessionIndex: 2,
  },
  projectModelConfig: {
    exists: SIM_MODE === "test",
    has_model: SIM_MODE === "test",
    model: SIM_MODE === "test" ? DEFAULT_PROJECT_MODEL : null,
    path: SIM_MODE === "test" ? "/mock/second-brain/opencode.jsonc" : "",
  },
};

const persistedOverrides = readSimOverrides();

if (SIM_MODE === "test") {
  if (typeof persistedOverrides.connected === "boolean") {
    state.chatStatus.connected = persistedOverrides.connected;
  }

  if (typeof persistedOverrides.autoReconnectOnInit === "boolean") {
    state.opencode.autoReconnectOnInit = persistedOverrides.autoReconnectOnInit;
  }

  if (typeof persistedOverrides.repoPath === "string") {
    state.config.second_brain.repo_path = persistedOverrides.repoPath;
    state.chatStatus.repo_path = persistedOverrides.repoPath;
  }

  if (typeof persistedOverrides.hasModel === "boolean") {
    state.projectModelConfig.has_model = persistedOverrides.hasModel;
    state.projectModelConfig.model = persistedOverrides.hasModel ? DEFAULT_PROJECT_MODEL : null;
  }
}

// ---------------------------------------------------------------------------
// Build handler map — platform mocks + either proxy or mock OpenCode handlers
// ---------------------------------------------------------------------------

const platformHandlers = createPlatformHandlers(state);
const opencodeHandlers: CommandHandlerMap =
  SIM_MODE === "dev"
    ? createProxyHandlers(emitToListeners)
    : createMockOpenCodeHandlers(state, emitToListeners);

const allHandlers: CommandHandlerMap = { ...platformHandlers, ...opencodeHandlers };

// ---------------------------------------------------------------------------
// Invoke handler — routes commands to handlers or event system
// ---------------------------------------------------------------------------

async function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  // Handle Tauri's internal event plugin commands
  if (command === "plugin:event|listen") {
    const event = args?.event as string;
    const handlerId = args?.handler as number;

    const listeners = eventListeners.get(event) ?? new Set();
    listeners.add(handlerId);
    eventListeners.set(event, listeners);

    // Tauri's JS event layer expects an id that can be passed back to
    // unregisterListener(event, id). Returning the handler callback id keeps
    // listen/unlisten semantics deterministic and avoids leaked listeners.
    return handlerId;
  }

  if (command === "plugin:event|unlisten") {
    const event = args?.event as string;
    const eventId = args?.eventId as number;
    const listeners = eventListeners.get(event);
    if (listeners) {
      listeners.delete(eventId);
      if (listeners.size === 0) eventListeners.delete(event);
    }

    // Keep callback map in sync even if callers skip unregisterListener.
    callbacks.delete(eventId);
    return;
  }

  if (command === "plugin:event|emit" || command === "plugin:event|emit_to") {
    const event = args?.event as string;
    const payload = args?.payload;
    emitToListeners(event, payload);
    return;
  }

  // Route to handler
  const handler = allHandlers[command];
  if (handler) {
    return handler(args);
  }

  console.warn(`[sim] unhandled invoke: ${command}`, args);
  return null;
}

// ---------------------------------------------------------------------------
// Install — patches window.__TAURI_INTERNALS__ before app loads
// ---------------------------------------------------------------------------

export function installSimulator(): void {
  // Patch the global that @tauri-apps/api reads from
  simWindow.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    convertFileSrc: (path: string) => path,
    unregisterCallback: (id: number) => {
      unregisterEventHandler(id);
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
  };

  // Patch the event plugin internals (used by _unlisten in @tauri-apps/api/event)
  simWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (_event: string, eventId: number) => {
      unregisterEventHandler(eventId);
    },
  };

  // Expose simulator API for Playwright
  simWindow.__sim = {
    emit: emitToListeners,
    state,
    getState: () => state,
    setConnected: (connected: boolean) => {
      state.chatStatus.connected = connected;
      writeSimOverrides({ connected });
    },
    setAutoReconnectOnInit: (enabled: boolean) => {
      state.opencode.autoReconnectOnInit = enabled;
      writeSimOverrides({ autoReconnectOnInit: enabled });
    },
    setHasModel: (hasModel: boolean) => {
      state.projectModelConfig.has_model = hasModel;
      if (!hasModel) {
        state.projectModelConfig.model = null;
      } else if (!state.projectModelConfig.model) {
        state.projectModelConfig.model = DEFAULT_PROJECT_MODEL;
      }
      writeSimOverrides({ hasModel });
    },
    setRepoPath: (path: string) => {
      state.config.second_brain.repo_path = path;
      state.chatStatus.repo_path = path;
      writeSimOverrides({ repoPath: path });
    },
    shutdown: shutdownProxy,
    mode: SIM_MODE,
  };

  console.log(`[sim] Flint simulator installed (mode: ${SIM_MODE}). Use window.__sim to control.`);

  // In dev mode, auto-initialize the OpenCode connection
  if (SIM_MODE === "dev") {
    const initHandler = allHandlers["init_opencode"];
    if (initHandler) {
      Promise.resolve(initHandler()).catch((e) =>
        console.warn("[sim] auto-init failed (is OpenCode server running?):", e),
      );
    }
  }
}
