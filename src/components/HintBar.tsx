import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
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
  { label: "Agent", keys: "Tab" },
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

const AGENT_HINTS: Hint[] = [
  { label: "Send", keys: "Enter" },
  { label: "Newline", keys: "Shift+Enter" },
  { label: "New", keys: "CmdOrCtrl+N" },
  { label: "Commands", keys: "/", raw: true },
  { label: "Search", keys: "Tab" },
  { label: "Clear", keys: "Escape" },
];

const MODEL_PICKER_HINTS: Hint[] = [
  { label: "Navigate", keys: "↑↓", raw: true },
  { label: "Select", keys: "Enter" },
  { label: "Actions", keys: "Shift+Enter" },
  { label: "Back", keys: "Escape" },
];

const MODEL_PICKER_REQUIRED_HINTS: Hint[] = [
  { label: "Navigate", keys: "↑↓", raw: true },
  { label: "Select", keys: "Enter" },
  { label: "Required", keys: "Set default", raw: true },
];

const MODEL_PICKER_ACTION_HINTS: Hint[] = [
  { label: "Select", keys: "Enter" },
  { label: "Back", keys: "Escape" },
];

const SLASH_MENU_HINTS: Hint[] = [
  { label: "Navigate", keys: "↑↓", raw: true },
  { label: "Select", keys: "Enter" },
  { label: "Dismiss", keys: "Escape" },
];

function useHints(): Hint[] {
  const mode = useSearchStore((s) => s.mode);
  const actionPanelOpen = useSearchStore((s) => s.actionPanelOpen);
  const armedActionIndex = useSearchStore((s) => s.armedActionIndex);
  const modelPickerOpen = useChatStore((s) => s.modelPickerOpen);
  const modelPickerMode = useChatStore((s) => s.modelPickerMode);
  const modelPickerActionPanelOpen = useChatStore((s) => s.modelPickerActionPanelOpen);
  const slashMenuOpen = useChatStore((s) => s.slashMenuOpen);

  if (modelPickerOpen) {
    if (modelPickerActionPanelOpen) {
      return MODEL_PICKER_ACTION_HINTS;
    }
    if (modelPickerMode === "default_required") {
      return MODEL_PICKER_REQUIRED_HINTS;
    }
    return MODEL_PICKER_HINTS;
  }
  if (slashMenuOpen) {
    return SLASH_MENU_HINTS;
  }
  if (actionPanelOpen) {
    return armedActionIndex !== null ? ACTION_ARMED_HINTS : ACTION_PANEL_HINTS;
  }
  return mode === "search" ? SEARCH_HINTS : AGENT_HINTS;
}

export default function HintBar() {
  const hints = useHints();

  return (
    <div className={styles.bar}>
      <div className={styles.hints}>
        {hints.map((hint) => (
          <span key={hint.keys} className={styles.hint}>
            {hint.raw ? <kbd className={styles.rawKbd}>{hint.keys}</kbd> : <Kbd keys={hint.keys} />}
            <span className={styles.label}>{hint.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
