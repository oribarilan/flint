import { useEffect, useRef, useState, useCallback } from "react";
import { Check } from "lucide-react";
import { useModelStore } from "../stores/modelStore";
import styles from "./ModelPicker.module.css";

interface ModelPickerProps {
  onClose: () => void;
}

export function ModelPicker({ onClose }: ModelPickerProps) {
  const models = useModelStore((s) => s.models);
  const setModels = useModelStore((s) => s.setModels);
  const currentModel = useModelStore((s) => s.currentModel);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch models on first open if not cached
  useEffect(() => {
    if (models.length === 0) {
      setIsLoading(true);
      window.flint
        ?.listModels()
        .then((result) => {
          setModels(result);
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

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use setTimeout to avoid closing immediately from the trigger click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

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

  return (
    <div ref={popoverRef} className={styles.popover} data-testid="model-picker">
      <div
        ref={listRef}
        className={styles.list}
        role="listbox"
        aria-label="Select model"
      >
        {isLoading && (
          <div className={styles.loading} role="status">
            Loading models…
          </div>
        )}
        {!isLoading &&
          models.map((model, index) => {
            const isSelected = model.id === currentModel;
            const isFocused = index === focusIndex;
            return (
              <div
                key={model.id}
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
