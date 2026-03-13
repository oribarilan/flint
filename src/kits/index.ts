/**
 * Kit system initialization — registers all built-in kit components.
 *
 * Call this once at app startup before any rendering occurs.
 */

import { registerKit } from "./registry";
import DefaultKitResult from "./DefaultKitResult";
import CoreSearchResult from "./CoreSearchResult";

export function initKitRegistry(): void {
  registerKit("_default", { SearchResult: DefaultKitResult });
  registerKit("core", { SearchResult: CoreSearchResult });
}
