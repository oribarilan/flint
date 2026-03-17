/**
 * Simulator mock layer for Tauri APIs.
 *
 * Patches `window.__TAURI_INTERNALS__` before the app loads so that all
 * Tauri IPC calls (`invoke`, `listen`, `emit`) are intercepted. The real
 * `@tauri-apps/api` packages read from this global, so no Vite aliases needed.
 *
 * Exposes `window.__sim` for programmatic control from Playwright tests.
 */

import type { FlintConfig, ChatStatus, KitManifestInfo } from "../src/lib/commands";
import type { KitSearchResult } from "../src/kits/types";

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

interface SimState {
  config: FlintConfig;
  chatStatus: ChatStatus;
  isStreaming: boolean;
}

const DEFAULT_CONFIG: FlintConfig = {
  general: {
    hotkey: "CmdOrCtrl+Shift+Space",
    launch_at_login: false,
    terminal: "auto",
    editor: "auto",
  },
  appearance: {
    font_size: "small",
    theme: "flint",
    backdrop_blur: false,
  },
  search: { directories: ["~"] },
  chat: { default_model: "gpt-4.1" },
  second_brain: { repo_path: "/Users/demo/second-brain" },
  kits: {},
};

const state: SimState = {
  config: structuredClone(DEFAULT_CONFIG),
  chatStatus: {
    connected: true,
    session_id: "sim-session-001",
    repo_path: "/Users/demo/second-brain",
  },
  isStreaming: false,
};

// ---------------------------------------------------------------------------
// Mock search results
// ---------------------------------------------------------------------------

function makeMockResults(query: string): KitSearchResult[] {
  if (!query || query.length < 2) return [];

  const items = [
    { title: "README.md", subtitle: "~/projects/flint/README.md", kind: "File" },
    { title: "package.json", subtitle: "~/projects/flint/package.json", kind: "File" },
    { title: "Visual Studio Code", subtitle: "/Applications/Visual Studio Code.app", kind: "Application" },
    { title: "Terminal", subtitle: "/Applications/Utilities/Terminal.app", kind: "Application" },
    { title: "Safari", subtitle: "/Applications/Safari.app", kind: "Application" },
    { title: "Notes", subtitle: "/Applications/Notes.app", kind: "Application" },
    { title: "Calculator", subtitle: "Kit command", kind: "Command" },
  ];

  const lower = query.toLowerCase();
  return items
    .filter((item) => item.title.toLowerCase().includes(lower))
    .map((item, i) => ({
      kitId: "core",
      id: `sim-${i}`,
      title: item.title,
      subtitle: item.subtitle,
      kind: item.kind as KitSearchResult["kind"],
      actions: [{ type: "Open" as const }, { type: "RevealInFileManager" as const }],
      score: 100 - i * 10,
    }));
}

// ---------------------------------------------------------------------------
// Mock chat streaming
// ---------------------------------------------------------------------------

let streamTimer: ReturnType<typeof setInterval> | null = null;

function simulateChatResponse(message: string): void {
  state.isStreaming = true;
  const response = generateMockResponse(message);
  const words = response.split(" ");
  let index = 0;

  streamTimer = setInterval(() => {
    if (index < words.length) {
      const token = (index === 0 ? "" : " ") + words[index];
      emitToListeners("chat:token", token);
      index++;
    } else {
      if (streamTimer) clearInterval(streamTimer);
      streamTimer = null;
      emitToListeners("chat:done", null);
      state.isStreaming = false;
    }
  }, 50);
}

function generateMockResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi")) {
    return "Hello! I'm the Flint simulator. I can help you test the UI. Try asking me something about your second brain.";
  }
  if (lower.includes("search") || lower.includes("find")) {
    return "I found several relevant notes in your second brain. Here are the top matches based on your query.";
  }
  if (lower.includes("help")) {
    return "I can help you capture and retrieve information from your second brain. Try typing a search query or asking me a question about your notes.";
  }
  return `You said: "${message}". This is a simulated response from the Flint UI simulator. In production, this would come from OpenCode.`;
}

// ---------------------------------------------------------------------------
// Invoke handler — routes commands to mock implementations
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

  // App commands
  switch (command) {
    case "hide_window":
    case "show_window":
    case "toggle_window":
    case "open_settings":
      console.log(`[sim] ${command}()`);
      return;

    case "search_files":
      return [];
    case "search_all":
      return makeMockResults((args?.query as string) ?? "");
    case "search_command":
      return [];

    case "get_chat_status":
      return structuredClone(state.chatStatus);
    case "send_chat_message": {
      const msg = (args?.message as string) ?? "";
      console.log(`[sim] send_chat_message: ${msg}`);
      simulateChatResponse(msg);
      return;
    }
    case "abort_chat":
      if (streamTimer) {
        clearInterval(streamTimer);
        streamTimer = null;
      }
      state.isStreaming = false;
      return;
    case "clear_chat":
      return;
    case "init_opencode":
      state.chatStatus = {
        connected: true,
        session_id: "sim-session-001",
        repo_path: state.config.second_brain.repo_path,
      };
      return;

    case "get_config":
      return structuredClone(state.config);
    case "get_default_config":
      return structuredClone(DEFAULT_CONFIG);
    case "update_config":
      state.config = structuredClone(args?.newConfig as FlintConfig);
      console.log("[sim] config updated");
      return;

    case "open_file":
    case "reveal_in_file_manager":
    case "delete_to_trash":
    case "open_in_editor":
    case "open_in_terminal":
      console.log(`[sim] ${command}(${args?.path})`);
      return;

    case "get_app_icon":
      return null;

    case "get_kit_manifests":
      return [] satisfies KitManifestInfo[];
    case "execute_command":
      return { type: "Done" };
    case "handle_custom_action":
      return null;

    default:
      console.warn(`[sim] unhandled invoke: ${command}`, args);
      return null;
  }
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
    unregisterListener: (event: string, eventId: number) => {
      const listeners = eventListeners.get(event);
      if (listeners) {
        // The eventId from our mock invoke is the ID we returned, but
        // the handler ID in the set is the callback ID from transformCallback.
        // For simplicity, just let invoke('plugin:event|unlisten') handle it.
      }
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
  };

  console.log("[sim] Flint simulator installed. Use window.__sim to control.");
}

