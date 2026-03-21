import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSearchStore } from "../stores/searchStore";

interface SessionUpdatePayload {
  serverId: string;
  sessionId: string;
  status: "idle" | "working" | "waiting" | "error";
}

/**
 * Refreshes active sessions-command results when monitor events arrive.
 *
 * This keeps the results list live while the command chip is active.
 */
export function useSessionMonitor(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    void listen<SessionUpdatePayload>("monitor:session_update", () => {
      const state = useSearchStore.getState();
      if (state.activeCommand?.kitId === "sessions") {
        state.refreshSearch();
      }
    }).then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
}
