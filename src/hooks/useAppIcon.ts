import { useEffect, useState } from "react";
import { getAppIcon } from "../lib/commands";

const iconCache = new Map<string, string | null>();

/**
 * Lazily fetch and cache a macOS app icon for the given path.
 * Returns a `data:image/png;base64,…` URI, or `null` while loading / on failure.
 */
export function useAppIcon(path: string, kind: string): string | null {
  const [icon, setIcon] = useState<string | null>(iconCache.get(path) ?? null);

  useEffect(() => {
    if (kind !== "application") return;
    if (iconCache.has(path)) {
      setIcon(iconCache.get(path) ?? null);
      return;
    }

    let cancelled = false;

    getAppIcon(path)
      .then((uri) => {
        iconCache.set(path, uri);
        if (!cancelled) setIcon(uri);
      })
      .catch(() => {
        iconCache.set(path, null);
      });

    return () => {
      cancelled = true;
    };
  }, [path, kind]);

  return icon;
}
