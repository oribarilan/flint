import { useCallback, useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import SearchBar from "./components/SearchBar";
import ResultsList from "./components/ResultsList";
import { useSearchStore } from "./stores/searchStore";
import { hideWindow } from "./lib/commands";
import { useSearch } from "./hooks/useSearch";
import styles from "./App.module.css";

export default function App() {
  useSearch();
  const searchBarRef = useRef<HTMLInputElement | null>(null);
  const query = useSearchStore((s) => s.query);
  const clearSearch = useSearchStore((s) => s.clearSearch);

  // Focus the search bar (used when returning from results list)
  const focusSearchBar = useCallback(() => {
    // The input lives inside SearchBar; find it via the launcher container
    const input = document.querySelector<HTMLInputElement>("input[aria-label='Search']");
    input?.focus();
  }, []);

  // Global Escape handler: hide window when query is empty
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && query.length === 0) {
        hideWindow().catch(() => {
          // Window hide is best-effort
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [query]);

  // Tauri window events: blur → hide, focus → clear & refocus
  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    const setup = async () => {
      const appWindow = getCurrentWebviewWindow();

      const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          void hideWindow();
        } else {
          clearSearch();
          focusSearchBar();
        }
      });

      unlistenFocus = unlisten;
    };

    void setup();
    return () => unlistenFocus?.();
  }, [clearSearch, focusSearchBar]);

  return (
    <div className={styles.launcher} ref={searchBarRef}>
      <SearchBar
        onArrowDown={() => {
          const list = document.querySelector<HTMLDivElement>("[role='listbox']");
          list?.focus();
        }}
      />
      <ResultsList onEscape={focusSearchBar} />
    </div>
  );
}
