import { globalShortcut } from "electron";
import { toggleOverlay } from "./overlay";

let currentHotkey: string | null = null;

export function registerHotkey(accelerator: string): boolean {
  unregisterHotkey();
  try {
    const success = globalShortcut.register(accelerator, () => {
      toggleOverlay();
    });
    if (success) {
      currentHotkey = accelerator;
    }
    return success;
  } catch (err) {
    console.error("[hotkey] Failed to register:", accelerator, err);
    return false;
  }
}

export function unregisterHotkey(): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
    currentHotkey = null;
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
  currentHotkey = null;
}
