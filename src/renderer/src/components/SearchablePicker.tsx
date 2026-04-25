import { useEffect, useRef, useState } from "react";
import { Picker, type PickerItem } from "./Picker";
import styles from "./SearchablePicker.module.css";

export interface SearchablePickerProps {
  items: PickerItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  label: string;
  idPrefix?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

export function SearchablePicker({
  items,
  selectedId,
  onSelect,
  label,
  idPrefix,
  searchPlaceholder = "Search…",
  emptyMessage = "No results",
}: SearchablePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredItems = searchQuery
    ? items.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  // Auto-focus search input on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <>
      <input
        ref={searchRef}
        type="text"
        className={styles.searchInput}
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        aria-label={`Search ${label.toLowerCase()}`}
      />
      {filteredItems.length === 0 && searchQuery ? (
        <div className={styles.noResults}>{emptyMessage}</div>
      ) : (
        <Picker
          items={filteredItems}
          selectedId={selectedId}
          onSelect={onSelect}
          label={label}
          idPrefix={idPrefix}
        />
      )}
    </>
  );
}
