import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { useSearchStore, type SearchResult } from "../stores/searchStore";
import { openFile, hideWindow } from "../lib/commands";
import KindIcon from "./KindIcon";
import styles from "./ResultsList.module.css";

interface ResultsListProps {
  onEscape: () => void;
}

export default function ResultsList({ onEscape }: ResultsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const results = useSearchStore((s) => s.results);
  const query = useSearchStore((s) => s.query);
  const selectedIndex = useSearchStore((s) => s.selectedIndex);
  const moveSelection = useSearchStore((s) => s.moveSelection);
  const setSelectedIndex = useSearchStore((s) => s.setSelectedIndex);

  const openResult = useCallback((result: SearchResult) => {
    openFile(result.path)
      .then(() => hideWindow())
      .catch((err: unknown) => {
        console.error("Failed to open file:", err);
      });
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const selected = container.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveSelection("down");
        break;
      case "ArrowUp":
        e.preventDefault();
        if (selectedIndex === 0) {
          onEscape();
        } else {
          moveSelection("up");
        }
        break;
      case "Enter": {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          openResult(selected);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        onEscape();
        break;
    }
  };

  if (results.length === 0 && query.length === 0) {
    return null;
  }

  if (results.length === 0 && query.length > 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>No results found</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="listbox"
      aria-label="Search results"
    >
      {results.map((result, index) => (
        <div
          key={result.id}
          className={index === selectedIndex ? styles.itemSelected : styles.item}
          role="option"
          aria-selected={index === selectedIndex}
          onMouseEnter={() => {
            setSelectedIndex(index);
          }}
          onClick={() => {
            openResult(result);
          }}
        >
          <KindIcon kind={result.kind} path={result.path} selected={index === selectedIndex} />
          <div className={styles.details}>
            <span className={styles.name}>{result.name}</span>
            <span className={styles.path}>{result.path}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
