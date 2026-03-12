import { useEffect, useRef, type KeyboardEvent } from "react";
import { useSearchStore } from "../stores/searchStore";
import styles from "./SearchBar.module.css";

interface SearchBarProps {
  onArrowDown: () => void;
}

export default function SearchBar({ onArrowDown }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((s) => s.query);
  const isLoading = useSearchStore((s) => s.isLoading);
  const setQuery = useSearchStore((s) => s.setQuery);
  const clearSearch = useSearchStore((s) => s.clearSearch);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onArrowDown();
    } else if (e.key === "Escape") {
      if (query.length > 0) {
        clearSearch();
      }
      // If query is empty, the global handler in App will hide the window
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Search icon (magnifying glass SVG) */}
      <svg
        className={styles.icon}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>

      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search files or ask anything..."
        spellCheck={false}
        autoComplete="off"
        aria-label="Search"
      />

      {isLoading && <div className={styles.spinner} aria-label="Loading" />}
    </div>
  );
}
