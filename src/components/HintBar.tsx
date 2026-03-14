import { useSearchStore } from "../stores/searchStore";
import Kbd from "./Kbd";
import styles from "./HintBar.module.css";

interface Hint {
  label: string;
  /** Key combo for Kbd, or raw display string when `raw` is true. */
  keys: string;
  raw?: boolean;
}

const SEARCH_HINTS: Hint[] = [
  { label: "Navigate", keys: "↑↓", raw: true },
  { label: "Navigate", keys: "⌃J/K", raw: true },
  { label: "Open", keys: "Enter" },
  { label: "Actions", keys: "Shift+Enter" },
  { label: "Chat", keys: "Tab" },
  { label: "Dismiss", keys: "Escape" },
];

const ACTION_PANEL_HINTS: Hint[] = [
  { label: "Navigate", keys: "↑↓", raw: true },
  { label: "Run action", keys: "Enter" },
  { label: "Back", keys: "Escape" },
];

const ACTION_ARMED_HINTS: Hint[] = [
  { label: "Confirm delete", keys: "Enter" },
  { label: "Cancel", keys: "Escape" },
];

const CHAT_HINTS: Hint[] = [
  { label: "Send", keys: "Enter" },
  { label: "Newline", keys: "Shift+Enter" },
  { label: "Search", keys: "Tab" },
  { label: "Clear", keys: "Escape" },
];

function useHints(): Hint[] {
  const mode = useSearchStore((s) => s.mode);
  const actionPanelOpen = useSearchStore((s) => s.actionPanelOpen);
  const armedActionIndex = useSearchStore((s) => s.armedActionIndex);

  if (actionPanelOpen) {
    return armedActionIndex !== null ? ACTION_ARMED_HINTS : ACTION_PANEL_HINTS;
  }
  return mode === "search" ? SEARCH_HINTS : CHAT_HINTS;
}

export default function HintBar() {
  const hints = useHints();

  return (
    <div className={styles.bar}>
      {hints.map((hint) => (
        <span key={hint.keys} className={styles.hint}>
          {hint.raw ? <kbd className={styles.rawKbd}>{hint.keys}</kbd> : <Kbd keys={hint.keys} />}
          <span className={styles.label}>{hint.label}</span>
        </span>
      ))}
    </div>
  );
}
