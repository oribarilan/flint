import { useState, useCallback, useRef } from "react";
import kitStyles from "./KitsSettings.module.css";

interface HotkeyRecorderProps {
  value: string;
  onChange: (hotkey: string) => void;
  ariaLabel: string;
}

/** Map browser modifier keys to Tauri shortcut format. */
function formatKeyCombo(e: React.KeyboardEvent): string | null {
  const key = e.key;

  // Ignore standalone modifier presses
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) {
    return null;
  }

  const parts: string[] = [];

  if (e.metaKey || e.ctrlKey) {
    parts.push("CmdOrCtrl");
  }
  if (e.shiftKey) {
    parts.push("Shift");
  }
  if (e.altKey) {
    parts.push("Alt");
  }

  // Normalize key names to Tauri format
  let normalizedKey = key;
  switch (key) {
    case " ":
      normalizedKey = "Space";
      break;
    case "Enter":
    case "Tab":
    case "Backspace":
    case "Delete":
    case "Escape":
      normalizedKey = key;
      break;
    case "ArrowUp":
      normalizedKey = "Up";
      break;
    case "ArrowDown":
      normalizedKey = "Down";
      break;
    case "ArrowLeft":
      normalizedKey = "Left";
      break;
    case "ArrowRight":
      normalizedKey = "Right";
      break;
    default:
      // Single character keys — uppercase
      if (normalizedKey.length === 1) {
        normalizedKey = normalizedKey.toUpperCase();
      }
      break;
  }

  // Require at least one modifier for a valid hotkey
  if (parts.length === 0) {
    return null;
  }

  parts.push(normalizedKey);
  return parts.join("+");
}

/** Format a Tauri hotkey string for display (e.g., CmdOrCtrl+Shift+= → ⌘⇧=). */
function displayHotkey(hotkey: string): string {
  return hotkey
    .replace(/CmdOrCtrl\+/g, "⌘")
    .replace(/Shift\+/g, "⇧")
    .replace(/Alt\+/g, "⌥")
    .replace(/Ctrl\+/g, "⌃");
}

/**
 * Hotkey recorder — always renders as a capsule with consistent dimensions.
 * Click to record, press modifier+key to capture, × to clear/cancel.
 */
export default function HotkeyRecorder({ value, onChange, ariaLabel }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        inputRef.current?.blur();
        return;
      }

      const combo = formatKeyCombo(e);
      if (combo) {
        onChange(combo);
        setRecording(false);
        inputRef.current?.blur();
      }
    },
    [onChange],
  );

  const showClear = recording || value;

  return (
    <span
      className={[kitStyles.hotkeyCapsule, recording ? kitStyles.hotkeyCapsuleRecording : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {recording ? (
        <button
          ref={inputRef}
          className={kitStyles.hotkeyBtn}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            if (e.relatedTarget && e.currentTarget.parentElement?.contains(e.relatedTarget)) {
              return;
            }
            setRecording(false);
          }}
          aria-label={ariaLabel}
          autoFocus
        >
          <span className={kitStyles.hotkeyPlaceholder}>Press keys…</span>
        </button>
      ) : (
        <button
          className={kitStyles.hotkeyBtn}
          onClick={() => {
            setRecording(true);
          }}
          aria-label={ariaLabel}
        >
          {value ? (
            <span className={kitStyles.hotkeyValue}>{displayHotkey(value)}</span>
          ) : (
            <span className={kitStyles.hotkeyPlaceholder}>none</span>
          )}
        </button>
      )}
      {showClear && (
        <button
          className={kitStyles.hotkeyClear}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (recording) {
              setRecording(false);
            } else {
              onChange("");
            }
          }}
          aria-label={recording ? "Cancel recording" : `Clear ${ariaLabel}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
