import { useSearchStore, type AppMode } from "../stores/searchStore";
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
  { label: "Chat", keys: "Tab" },
  { label: "Dismiss", keys: "Escape" },
];

const CHAT_HINTS: Hint[] = [
  { label: "Send", keys: "Enter" },
  { label: "Newline", keys: "Shift+Enter" },
  { label: "Search", keys: "Tab" },
  { label: "Clear", keys: "Escape" },
];

function hintsForMode(mode: AppMode): Hint[] {
  return mode === "search" ? SEARCH_HINTS : CHAT_HINTS;
}

export default function HintBar() {
  const mode = useSearchStore((s) => s.mode);
  const hints = hintsForMode(mode);

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
