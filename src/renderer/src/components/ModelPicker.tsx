import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import { Check } from "lucide-react";
import { useModelStore } from "../stores/modelStore";
import styles from "./ModelPicker.module.css";

interface ModelPickerProps {
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export function ModelPicker({ onClose, triggerRef }: ModelPickerProps) {
  const models = useModelStore((s) => s.models);
  const setModels = useModelStore((s) => s.setModels);
  const currentModel = useModelStore((s) => s.currentModel);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch models on first open if not cached
  useEffect(() => {
    if (models.length === 0) {
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
  }, [models.length, setModels]);

  // Set initial focus index to current model
  useEffect(() => {
    if (models.length > 0) {
      const idx = models.findIndex((m) => m.id === currentModel);
      setFocusIndex(idx >= 0 ? idx : 0);
    }
  }, [models, currentModel]);

  // Click outside to close (exclude trigger button to avoid race condition)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, triggerRef]);

  const selectModel = useCallback(
    (modelId: string) => {
      window.flint?.setModel(modelId);
      onClose();
    },
    [onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIndex((prev) => (prev < models.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter" && focusIndex >= 0 && focusIndex < models.length) {
        e.preventDefault();
        e.stopPropagation();
        selectModel(models[focusIndex].id);
      } else if (e.key === "Tab") {
        // Trap focus inside popover
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [models, focusIndex, selectModel]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      const item = items[focusIndex];
      if (item && typeof item.scrollIntoView === "function") {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusIndex]);

  const activeDescendant =
    focusIndex >= 0 && focusIndex < models.length
      ? `model-option-${models[focusIndex].id}`
      : undefined;

  return (
    <div ref={popoverRef} className={styles.popover} data-testid="model-picker">
      <div
        ref={listRef}
        className={styles.list}
        role="listbox"
        aria-label="Select model"
        aria-activedescendant={activeDescendant}
        tabIndex={0}
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
        {!isLoading &&
          !error &&
          models.map((model, index) => {
            const isSelected = model.id === currentModel;
            const isFocused = index === focusIndex;
            return (
              <div
                key={model.id}
                id={`model-option-${model.id}`}
                role="option"
                aria-selected={isSelected}
                className={`${styles.option} ${isFocused ? styles.focused : ""}`}
                onClick={() => selectModel(model.id)}
                onMouseEnter={() => setFocusIndex(index)}
                data-testid={`model-option-${model.id}`}
              >
                <span className={styles.checkSlot}>
                  {isSelected && (
                    <Check size={16} className={styles.checkIcon} aria-hidden="true" />
                  )}
                </span>
                <span className={styles.optionName}>{model.name}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
