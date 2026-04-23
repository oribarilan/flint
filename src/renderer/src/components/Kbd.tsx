import { isMac } from "../lib/platform";
import styles from "./Kbd.module.css";

const MAC_MODIFIERS: Record<string, string> = {
  CmdOrCtrl: "⌘",
  Shift: "⇧",
  Alt: "⌥",
  Ctrl: "⌃",
};

const PC_MODIFIERS: Record<string, string> = {
  CmdOrCtrl: "Ctrl",
  Shift: "Shift",
  Alt: "Alt",
  Ctrl: "Ctrl",
};

const SYMBOL_MAP: Record<string, string> = {
  Enter: "↵",
  Escape: "⎋",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Tab: "Tab",
};

/** Parse "CmdOrCtrl+Shift+1" into platform-appropriate display segments. */
function formatKeys(keys: string, mac: boolean): string[] {
  const modifiers = mac ? MAC_MODIFIERS : PC_MODIFIERS;
  const parts = keys.split("+");
  const segments: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    const mod = modifiers[trimmed];
    const sym = SYMBOL_MAP[trimmed];
    if (mod) {
      segments.push(mod);
    } else if (sym) {
      segments.push(sym);
    } else {
      segments.push(trimmed);
    }
  }

  return segments;
}

interface KbdProps {
  /** Key combo in canonical format, e.g. "CmdOrCtrl+," or "Shift+Enter" */
  keys: string;
}

export default function Kbd({ keys }: KbdProps) {
  const mac = isMac();
  const segments = formatKeys(keys, mac);
  const separator = mac ? "" : "+";

  return <kbd className={styles.kbd}>{segments.join(separator)}</kbd>;
}
