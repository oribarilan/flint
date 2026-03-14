import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSearchStore } from "../stores/searchStore";
import type { ActiveCommand } from "../kits/types";
import type { KitIcon } from "../kits/types";

/** Payload emitted by Rust when a global command hotkey is pressed. */
interface CommandActivatePayload {
  kitId: string;
  commandId: string;
  name: string;
  icon?: KitIcon;
}

/**
 * Listens for `command:activate` events from the Rust global shortcut
 * handler. When an `InputResults`-mode command is triggered via its
 * global hotkey, this hook activates the command chip in the search bar.
 */
export function useCommandActivation(): void {
  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const unlisten = await listen<CommandActivatePayload>("command:activate", (event) => {
        const { kitId, commandId, name, icon } = event.payload;
        const cmd: ActiveCommand = { kitId, commandId, name, icon };
        useSearchStore.getState().activateCommand(cmd);
      });

      if (cancelled) {
        unlisten();
      } else {
        unlisteners.push(unlisten);
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
