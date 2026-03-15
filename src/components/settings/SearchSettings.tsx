import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { FlintConfig } from "../../lib/commands";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

interface SearchSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

function useInlineAdd(onAdd: (value: string) => void) {
  const [isAdding, setIsAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue("");
      setIsAdding(false);
    } else if (e.key === "Escape") {
      setInputValue("");
      setIsAdding(false);
    }
  }

  function handleBlur() {
    setInputValue("");
    setIsAdding(false);
  }

  return { isAdding, setIsAdding, inputValue, setInputValue, inputRef, handleKeyDown, handleBlur };
}

export default function SearchSettings({ config, onUpdate, onResetSection }: SearchSettingsProps) {
  const handleResetDefaults = async () => {
    await onResetSection("search");
  };

  const dirs = useInlineAdd((value) => {
    const updated = [...config.search.directories, value];
    void onUpdate({ ...config, search: { ...config.search, directories: updated } });
  });

  const patterns = useInlineAdd((value) => {
    const updated = [...config.search.exclude, value];
    void onUpdate({ ...config, search: { ...config.search, exclude: updated } });
  });

  function removeDirectory(dir: string) {
    const updated = config.search.directories.filter((d) => d !== dir);
    void onUpdate({ ...config, search: { ...config.search, directories: updated } });
  }

  function removePattern(pattern: string) {
    const updated = config.search.exclude.filter((p) => p !== pattern);
    void onUpdate({ ...config, search: { ...config.search, exclude: updated } });
  }

  function updateMaxDepth(value: number) {
    const clamped = Math.max(1, Math.min(10, value));
    void onUpdate({ ...config, search: { ...config.search, max_depth: clamped } });
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Search</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Indexed Directories</h3>
        {config.search.directories.length > 0 ? (
          <ul className={styles.list}>
            {config.search.directories.map((dir) => (
              <li key={dir} className={styles.listItemEditable}>
                <span>{dir}</span>
                <button
                  className={styles.removeButton}
                  onClick={() => {
                    removeDirectory(dir);
                  }}
                  aria-label={`Remove ${dir}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyList}>No directories configured</p>
        )}
        {dirs.isAdding ? (
          <input
            ref={dirs.inputRef}
            className={styles.inlineInput}
            type="text"
            placeholder="/path/to/directory"
            value={dirs.inputValue}
            onChange={(e) => {
              dirs.setInputValue(e.target.value);
            }}
            onKeyDown={dirs.handleKeyDown}
            onBlur={dirs.handleBlur}
          />
        ) : (
          <button
            className={styles.addButton}
            onClick={() => {
              dirs.setIsAdding(true);
            }}
          >
            + Add directory
          </button>
        )}
        <div className={styles.row}>
          <span className={styles.label}>Max directory depth</span>
          <input
            className={styles.numberInput}
            type="number"
            min={1}
            max={10}
            value={config.search.max_depth}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              if (!isNaN(parsed)) {
                updateMaxDepth(parsed);
              }
            }}
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Exclude Patterns</h3>
        {config.search.exclude.length > 0 ? (
          <ul className={styles.list}>
            {config.search.exclude.map((pattern) => (
              <li key={pattern} className={styles.listItemEditable}>
                <span>{pattern}</span>
                <button
                  className={styles.removeButton}
                  onClick={() => {
                    removePattern(pattern);
                  }}
                  aria-label={`Remove ${pattern}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyList}>No exclude patterns configured</p>
        )}
        {patterns.isAdding ? (
          <input
            ref={patterns.inputRef}
            className={styles.inlineInput}
            type="text"
            placeholder="*.log, node_modules, .git"
            value={patterns.inputValue}
            onChange={(e) => {
              patterns.setInputValue(e.target.value);
            }}
            onKeyDown={patterns.handleKeyDown}
            onBlur={patterns.handleBlur}
          />
        ) : (
          <button
            className={styles.addButton}
            onClick={() => {
              patterns.setIsAdding(true);
            }}
          >
            + Add pattern
          </button>
        )}
      </section>

      <ResetSection
        label="Reset search settings to defaults?"
        onReset={handleResetDefaults}
      />
    </div>
  );
}
