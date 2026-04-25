import styles from "./HotkeyHint.module.css";

const MODIFIER_SYMBOLS: Record<string, string> = {
  ctrl: "⌃",
  cmd: "⌘",
  meta: "⌘",
  shift: "⇧",
  alt: "⌥",
  option: "⌥",
};

const SPECIAL_SYMBOLS: Record<string, string> = {
  enter: "↵",
  space: "␣",
  escape: "esc",
};

export function formatKey(key: string): string {
  const lower = key.toLowerCase();
  if (MODIFIER_SYMBOLS[lower]) return MODIFIER_SYMBOLS[lower];
  if (SPECIAL_SYMBOLS[lower]) return SPECIAL_SYMBOLS[lower];
  return key.toUpperCase();
}

export interface HotkeyHintProps {
  keys: string[];
  className?: string;
}

export function HotkeyHint({ keys, className }: HotkeyHintProps) {
  const containerClass = className ? `${styles.container} ${className}` : styles.container;

  return (
    <span className={containerClass} aria-hidden="true">
      {keys.map((key, i) => (
        <kbd key={`${key}-${i}`} className={styles.key}>
          {formatKey(key)}
        </kbd>
      ))}
    </span>
  );
}
