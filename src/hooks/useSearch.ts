import { useEffect, useRef } from "react";
import { useSearchStore } from "../stores/searchStore";
import { searchAll, searchCommand } from "../lib/commands";

export function useSearch(): void {
  const query = useSearchStore((s) => s.query);
  const activeCommand = useSearchStore((s) => s.activeCommand);
  const searchVersion = useSearchStore((s) => s.searchVersion);
  const setResults = useSearchStore((s) => s.setResults);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.length < 2 && !activeCommand) {
      setResults([]);
      return;
    }

    useSearchStore.setState({ isLoading: true });

    timerRef.current = setTimeout(() => {
      const searchPromise = activeCommand
        ? searchCommand(activeCommand.kitId, activeCommand.commandId, query)
        : searchAll(query);

      searchPromise
        .then((results) => {
          if (useSearchStore.getState().query === query) {
            setResults(results);
          }
        })
        .catch((err: unknown) => {
          console.error("Search failed:", err);
        })
        .finally(() => {
          useSearchStore.setState({ isLoading: false });
        });
    }, 150);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, activeCommand, searchVersion, setResults]);
}
