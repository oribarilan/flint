import { useState, useCallback, forwardRef, type KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import styles from "./ChatInput.module.css";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  selectedItems?: { id: string; title: string }[];
}

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(function ChatInput(
  { onSend, disabled, placeholder = "Ask Flint anything…" },
  ref,
) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className={styles.container}>
      <div className={styles.inputWrapper}>
        <input
          ref={ref}
          className={styles.input}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Chat with Flint"
          aria-disabled={disabled ?? undefined}
          autoFocus
        />
      </div>
      <button
        className={styles.hint}
        onClick={handleSubmit}
        aria-label="Send"
        type="button"
        tabIndex={-1}
      >
        <ArrowUp size={12} />
      </button>
    </div>
  );
});
