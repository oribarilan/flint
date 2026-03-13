import { useEffect, useRef } from "react";
import { useSearchStore } from "../stores/searchStore";
import { searchAll } from "../lib/commands";

export function useSearch(): void {
  const query = useSearchStore((s) => s.query);
  const setResults = useSearchStore((s) => s.setResults);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.length < 2) {
      setResults([]);
      return;
    }

    useSearchStore.setState({ isLoading: true });

    timerRef.current = setTimeout(() => {
      searchAll(query)
        .then((results) => {
          // Only update if query hasn't changed since we fired
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
    }, 50);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, setResults]);
}
