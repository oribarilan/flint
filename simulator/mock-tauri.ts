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

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

const SIM_MODE: "dev" | "test" = import.meta.env.MODE === "test" ? "test" : "dev";

// ---------------------------------------------------------------------------
// Event system — mirrors Tauri's event infrastructure
// ---------------------------------------------------------------------------

type EventHandler = (event: { event: string; id: number; payload: unknown }) => void;

let nextCallbackId = 1;
const callbacks = new Map<number, EventHandler>();
const eventListeners = new Map<string, Set<number>>();

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
    connected: SIM_MODE === "test",
    session_id: SIM_MODE === "test" ? "sim-session-001" : null,
    repo_path: null,
  },
  isStreaming: false,
};

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

let nextEventId = 1;

async function invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  // Handle Tauri's internal event plugin commands
  if (command === "plugin:event|listen") {
    const event = args?.event as string;
    const handlerId = args?.handler as number;
    const eventId = nextEventId++;

    const listeners = eventListeners.get(event) ?? new Set();
    listeners.add(handlerId);
    eventListeners.set(event, listeners);

    return eventId;
  }

  if (command === "plugin:event|unlisten") {
    const event = args?.event as string;
    const eventId = args?.eventId as number;
    const listeners = eventListeners.get(event);
    if (listeners) {
      listeners.delete(eventId);
      if (listeners.size === 0) eventListeners.delete(event);
    }
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
  (window as Record<string, unknown>).__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    convertFileSrc: (path: string) => path,
    unregisterCallback: (id: number) => {
      callbacks.delete(id);
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
  };

  // Patch the event plugin internals (used by _unlisten in @tauri-apps/api/event)
  (window as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (_event: string, _eventId: number) => {
      // Handled by invoke('plugin:event|unlisten')
    },
  };

  // Expose simulator API for Playwright
  (window as Record<string, unknown>).__sim = {
    emit: emitToListeners,
    state,
    getState: () => state,
    setConnected: (connected: boolean) => {
      state.chatStatus.connected = connected;
    },
    setRepoPath: (path: string) => {
      state.config.second_brain.repo_path = path;
      state.chatStatus.repo_path = path;
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
