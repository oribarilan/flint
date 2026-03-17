import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../stores/chatStore";

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
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const tokenUn = await listen<string>("chat:token", (event) => {
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

      if (cancelled) {
        tokenUn();
        doneUn();
        errorUn();
        toolStartUn();
        toolEndUn();
      } else {
        unlisteners.push(tokenUn, doneUn, errorUn, toolStartUn, toolEndUn);
      }
    };

    void setup().catch((err: unknown) => {
      console.error("Failed to setup chat listeners:", err);
    });
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => {
        fn();
      });
    };
  }, []);
}
