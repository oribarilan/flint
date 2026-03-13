/** Kit component registry — maps kit IDs to their React components. */

import type { FC } from "react";
import type { KitSearchResult } from "./types";

// ---------------------------------------------------------------------------
// Component interfaces
// ---------------------------------------------------------------------------

export interface KitResultProps {
  result: KitSearchResult;
  isSelected: boolean;
  index: number;
}

export interface KitComponents {
  /** Renders a search result row for this kit. */
  SearchResult: FC<KitResultProps>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const KIT_REGISTRY: Record<string, KitComponents> = {};

/** Register components for a kit. */
export function registerKit(kitId: string, components: KitComponents): void {
  KIT_REGISTRY[kitId] = components;
}

/** Get components for a kit, falling back to the default renderer. */
export function getKitComponents(kitId: string): KitComponents {
  const kit = KIT_REGISTRY[kitId] ?? KIT_REGISTRY["_default"];
  if (!kit) {
    throw new Error(`No kit components registered for "${kitId}" and no default renderer`);
  }
  return kit;
}
