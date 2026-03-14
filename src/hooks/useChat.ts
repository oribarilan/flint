import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../stores/chatStore";

/**
 * Subscribes to Tauri chat events and forwards them to the chat store.
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

      if (cancelled) {
        tokenUn();
        doneUn();
        errorUn();
      } else {
        unlisteners.push(tokenUn, doneUn, errorUn);
      }
    };

    void setup();
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => {
        fn();
      });
    };
  }, []);
}
