import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../stores/chatStore";

interface ListenerRegistryState {
  refCount: number;
  setupPromise: Promise<void> | null;
  unlisteners: (() => void)[] | null;
  tokenEventCount: number;
  setupGeneration: number;
}

const listenerRegistry: ListenerRegistryState = {
  refCount: 0,
  setupPromise: null,
  unlisteners: null,
  tokenEventCount: 0,
  setupGeneration: 0,
};

function logDevDiagnostic(message: string): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[chat-diag] ${message}`);
}

async function setupListeners(generation: number): Promise<void> {
  const tokenUn = await listen<string>("chat:token", (event) => {
    listenerRegistry.tokenEventCount += 1;
    if (import.meta.env.DEV) {
      const count = listenerRegistry.tokenEventCount;
      if (count <= 3 || count % 50 === 0) {
        logDevDiagnostic(`token event #${String(count)}`);
      }
    }
    useChatStore.getState().appendToken(event.payload);
  });
  const doneUn = await listen("chat:done", () => {
    useChatStore.getState().finishResponse();
  });
  const errorUn = await listen<string>("chat:error", (event) => {
    useChatStore.getState().setError(event.payload);
  });
  const toolStartUn = await listen<string>("chat:tool_start", (event) => {
    useChatStore.getState().addToolCall({ kitId: null, toolName: event.payload });
  });
  const toolEndUn = await listen<string>("chat:tool_end", (event) => {
    useChatStore.getState().removeToolCall(event.payload);
  });

  const unlisteners = [tokenUn, doneUn, errorUn, toolStartUn, toolEndUn];
  if (listenerRegistry.refCount === 0 || listenerRegistry.setupGeneration !== generation) {
    unlisteners.forEach((fn) => {
      fn();
    });
    return;
  }

  listenerRegistry.unlisteners = unlisteners;
  logDevDiagnostic("listeners registered (count=5)");
}

function teardownListeners(): void {
  const current = listenerRegistry.unlisteners;
  if (!current) return;
  current.forEach((fn) => {
    fn();
  });
  listenerRegistry.unlisteners = null;
  listenerRegistry.tokenEventCount = 0;
  logDevDiagnostic("listeners removed");
}

/**
 * Subscribes to Tauri chat events and forwards them to the chat store.
 *
 * Listens for OpenCode SSE events bridged by the Rust backend:
 * - `chat:token` — text content delta
 * - `chat:done` — response complete
 * - `chat:error` — error occurred
 * - `chat:tool_start` / `chat:tool_end` — tool call lifecycle
 *
 * Uses `useChatStore.getState()` inside callbacks so the effect needs no
 * dependencies and registers listeners exactly once. A local `cancelled`
 * flag handles React StrictMode's double-mount by immediately unlistening
 * if the effect was cleaned up while the async `listen()` calls were pending.
 */
export function useChat(): void {
  useEffect(() => {
    listenerRegistry.refCount += 1;

    if (listenerRegistry.unlisteners === null && listenerRegistry.setupPromise === null) {
      listenerRegistry.setupGeneration += 1;
      const generation = listenerRegistry.setupGeneration;
      listenerRegistry.setupPromise = setupListeners(generation)
        .catch((err: unknown) => {
          console.error("Failed to setup chat listeners:", err);
        })
        .finally(() => {
          listenerRegistry.setupPromise = null;
        });
    }

    return () => {
      listenerRegistry.refCount = Math.max(0, listenerRegistry.refCount - 1);
      if (listenerRegistry.refCount === 0) {
        teardownListeners();
      }
    };
  }, []);
}
