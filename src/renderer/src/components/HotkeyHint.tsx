import styles from "./HotkeyHint.module.css";

const MODIFIER_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  cmd: "Cmd",
  meta: "Cmd",
  shift: "Shift",
  alt: "Alt",
  option: "Opt",
};

const SPECIAL_LABELS: Record<string, string> = {
  enter: "↵",
  space: "Space",
  escape: "Esc",
};

function isModifier(key: string): boolean {
  return key.toLowerCase() in MODIFIER_LABELS;
}

export function formatKey(key: string): string {
  const lower = key.toLowerCase();
  if (MODIFIER_LABELS[lower]) return MODIFIER_LABELS[lower];
  if (SPECIAL_LABELS[lower]) return SPECIAL_LABELS[lower];
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
        <span key={`${key}-${i}`} className={styles.group}>
          {i > 0 && <span className={styles.separator}>+</span>}
          <kbd className={isModifier(key) ? styles.modifier : styles.key}>
            {formatKey(key)}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/** Renders [Modifier]+[K1]/[K2]/[K3] — a shared modifier with alternative keys */
export interface HotkeyGroupProps {
  modifier: string;
  keys: string[];
  className?: string;
}

export function HotkeyGroup({ modifier, keys, className }: HotkeyGroupProps) {
  const containerClass = className ? `${styles.container} ${className}` : styles.container;

  return (
    <span className={containerClass} aria-hidden="true">
      <kbd className={styles.modifier}>{formatKey(modifier)}</kbd>
      <span className={styles.separator}>+</span>
      {keys.map((key, i) => (
        <span key={`${key}-${i}`} className={styles.group}>
          {i > 0 && <span className={styles.altSeparator}>/</span>}
          <kbd className={isModifier(key) ? styles.modifier : styles.key}>
            {formatKey(key)}
          </kbd>
        </span>
      ))}
    </span>
  );
}
