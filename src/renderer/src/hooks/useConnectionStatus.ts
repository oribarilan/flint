import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../../../main/types";

/**
 * Subscribes to the main-process Copilot connection status.
 *
 * Default state before the first event is `"reconnecting"` — we don't yet
 * know whether the client is up, but we don't want to claim "connected"
 * (false reassurance) or "disconnected" (alarming) without evidence.
 */
export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");

  useEffect(() => {
    const unsubscribe = window.flint?.onConnectionStatus((next: string) => {
      setStatus(next as ConnectionStatus);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  return status;
}
