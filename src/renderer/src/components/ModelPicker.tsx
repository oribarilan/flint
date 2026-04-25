import { useEffect, useState, type RefObject } from "react";
import { useModelStore } from "../stores/modelStore";
import { Popover } from "./Popover";
import { SearchablePicker } from "./SearchablePicker";
import styles from "./ModelPicker.module.css";

interface ModelPickerProps {
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export function ModelPicker({ onClose, triggerRef }: ModelPickerProps) {
  const models = useModelStore((s) => s.models);
  const setModels = useModelStore((s) => s.setModels);
  const currentModel = useModelStore((s) => s.currentModel);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSelect = (id: string): void => {
    window.flint?.setModel(id);
    onClose();
  };

  return (
    <Popover
      onClose={onClose}
      triggerRef={triggerRef}
      className={styles.modelPickerPopover}
      data-testid="model-picker"
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
          selectedId={currentModel}
          onSelect={handleSelect}
          label="Select model"
          idPrefix="model-option"
          searchPlaceholder="Search models…"
          emptyMessage="No models match"
        />
      )}
    </Popover>
  );
}
