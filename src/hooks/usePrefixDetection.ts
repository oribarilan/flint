import { useEffect, useState } from "react";
import { useSearchStore } from "../stores/searchStore";
import { getKitManifests } from "../lib/commands";
import type { ActiveCommand } from "../kits/types";

/** A command prefix mapping: prefix string → command activation data. */
interface PrefixEntry {
  prefix: string;
  kitId: string;
  commandId: string;
  name: string;
}

/**
 * Detects command prefix patterns in the search query and auto-activates
 * the corresponding command chip.
 *
 * When the user types a known prefix followed by a space (e.g., `= `),
 * this hook activates the chip and strips the prefix from the query.
 * Prefix data is loaded once from `getKitManifests` on mount.
 */
export function usePrefixDetection(): void {
  const query = useSearchStore((s) => s.query);
  const activeCommand = useSearchStore((s) => s.activeCommand);
  const [prefixes, setPrefixes] = useState<PrefixEntry[]>([]);

  // Load command prefixes once on mount.
  useEffect(() => {
    getKitManifests()
      .then((manifests) => {
        const entries: PrefixEntry[] = [];
        for (const kit of manifests) {
          if (!kit.enabled) continue;
          for (const cmd of kit.commands) {
            if (cmd.enabled && cmd.effective_prefix) {
              entries.push({
                prefix: cmd.effective_prefix,
                kitId: kit.id,
                commandId: cmd.id,
                name: cmd.name,
              });
            }
          }
        }
        setPrefixes(entries);
      })
      .catch(() => {
        // Kit manifests unavailable — prefix detection disabled.
      });
  }, []);

  // Check query against prefixes on each change.
  useEffect(() => {
    if (activeCommand || prefixes.length === 0) return;

    for (const entry of prefixes) {
      const prefixWithSpace = entry.prefix + " ";
      if (query.startsWith(prefixWithSpace)) {
        const remainder = query.slice(prefixWithSpace.length);
        const cmd: ActiveCommand = {
          kitId: entry.kitId,
          commandId: entry.commandId,
          name: entry.name,
        };
        useSearchStore.getState().activateCommand(cmd);
        if (remainder.length > 0) {
          useSearchStore.getState().setQuery(remainder);
        }
        return;
      }
    }
  }, [query, activeCommand, prefixes]);
}
