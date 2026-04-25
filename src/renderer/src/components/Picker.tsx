import { useEffect, useRef, useState, useCallback } from "react";
import { Check } from "lucide-react";
import styles from "./Picker.module.css";

export interface PickerItem {
  id: string;
  label: string;
}

export interface PickerProps {
  items: PickerItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  label: string;
  idPrefix?: string;
}

export function Picker({ items, selectedId, onSelect, label, idPrefix = "picker-option" }: PickerProps) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Set initial focus index to selected item (or 0) whenever items change
  useEffect(() => {
    if (items.length > 0) {
      const idx = items.findIndex((item) => item.id === selectedId);
      setFocusIndex(idx >= 0 ? idx : 0);
    } else {
      setFocusIndex(-1);
    }
  }, [items, selectedId]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  // Keyboard navigation on document (works even when external search input has focus)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter") {
        // Use a callback to read the latest focusIndex
        setFocusIndex((currentIndex) => {
          if (currentIndex >= 0 && currentIndex < items.length) {
            e.preventDefault();
            e.stopPropagation();
            handleSelect(items[currentIndex].id);
          }
          return currentIndex;
        });
      } else if (e.key === "Tab") {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [items, handleSelect]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const optionElements = listRef.current.querySelectorAll('[role="option"]');
      const item = optionElements[focusIndex];
      if (item && typeof item.scrollIntoView === "function") {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusIndex]);

  const activeDescendant =
    focusIndex >= 0 && focusIndex < items.length
      ? `${idPrefix}-${items[focusIndex].id}`
      : undefined;

  return (
    <div
      ref={listRef}
      className={styles.list}
      role="listbox"
      aria-label={label}
      aria-activedescendant={activeDescendant}
      tabIndex={0}
    >
      {items.map((item, index) => {
        const isSelected = item.id === selectedId;
        const isFocused = index === focusIndex;
        return (
          <div
            key={item.id}
            id={`${idPrefix}-${item.id}`}
            role="option"
            aria-selected={isSelected}
            className={`${styles.option} ${isFocused ? styles.focused : ""}`}
            onClick={() => handleSelect(item.id)}
            onMouseEnter={() => setFocusIndex(index)}
          >
            <span className={styles.checkSlot}>
              {isSelected && (
                <Check size={16} className={styles.checkIcon} aria-hidden="true" />
              )}
            </span>
            <span className={styles.optionName}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
