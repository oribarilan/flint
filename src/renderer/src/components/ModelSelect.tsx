import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { useModelStore } from "../stores/modelStore";
import { Popover } from "./Popover";
import { SearchablePicker } from "./SearchablePicker";
import styles from "./ModelSelect.module.css";

interface ModelSelectProps {
  value: string;
  onChange: (modelId: string) => void;
  ariaLabel: string;
}

type DropDirection = "up" | "down";

function detectDirection(trigger: HTMLElement): DropDirection {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  // Prefer downward unless there's clearly more room above
  return spaceBelow < 200 && spaceAbove > spaceBelow ? "up" : "down";
}

export function ModelSelect({ value, onChange, ariaLabel }: ModelSelectProps) {
  const models = useModelStore((s) => s.models);
  const setModels = useModelStore((s) => s.setModels);
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<DropDirection>("down");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fetch models on first open if not cached
  useEffect(() => {
    if (isOpen && models.length === 0) {
      setIsLoading(true);
      setError(null);
      window.flint
        ?.listModels()
        .then((result) => {
          setModels(result);
        })
        .catch(() => {
          setError("Couldn't load models");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, models.length, setModels]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev && triggerRef.current) {
        setDirection(detectDirection(triggerRef.current));
      }
      return !prev;
    });
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setIsOpen(false);
    },
    [onChange],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const displayName = models.find((m) => m.id === value)?.name ?? value;

  const dropdownClass = direction === "up" ? styles.dropdownUp : styles.dropdownDown;

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={handleToggle}
      >
        {displayName}
        <ChevronDown size={12} className={styles.chevron} aria-hidden="true" />
      </button>

      {isOpen && (
        <Popover
          onClose={handleClose}
          triggerRef={triggerRef}
          className={`${styles.dropdown} ${dropdownClass}`}
        >
          {isLoading && (
            <div className={styles.loading} role="status">
              Loading models…
            </div>
          )}
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          {!isLoading && !error && models.length > 0 && (
            <SearchablePicker
              items={models.map((m) => ({ id: m.id, label: m.name }))}
              selectedId={value}
              onSelect={handleSelect}
              label={ariaLabel}
              idPrefix="settings-model"
              searchPlaceholder="Search models…"
              emptyMessage="No models match"
            />
          )}
        </Popover>
      )}
    </div>
  );
}
