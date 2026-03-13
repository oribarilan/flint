/** Kit system frontend types — mirrors Rust `kits::*` types. */

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

export type KitIcon =
  | { type: "Emoji"; value: string }
  | { type: "Named"; value: string }
  | { type: "DataUri"; value: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type KitAction =
  | { type: "Copy"; text: string; label?: string }
  | { type: "Open"; target: string }
  | { type: "FocusWindow"; window_id: number }
  | { type: "OpenApp" }
  | { type: "Custom"; id: string; label: string }
  | { type: "Paste"; text: string }
  | { type: "ActivateKit"; prefix: string };

// ---------------------------------------------------------------------------
// Accessories
// ---------------------------------------------------------------------------

export type Accessory =
  | { type: "Text"; value: string }
  | { type: "Badge"; text: string; color: string }
  | { type: "Icon"; icon: KitIcon };

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type KitPreview =
  | { type: "Text"; content: string }
  | { type: "Markdown"; content: string }
  | { type: "Html"; content: string };

// ---------------------------------------------------------------------------
// Search result (unified IPC type)
// ---------------------------------------------------------------------------

/** Unified search result from both core file search and kits. */
export interface KitSearchResult {
  /** `"core"` for file search, kit id otherwise. */
  kitId: string;
  /** Unique within the kit. */
  id: string;
  /** Primary display text. */
  title: string;
  /** Secondary text (path, description). */
  subtitle?: string;
  /** Result icon. */
  icon?: KitIcon;
  /** Right-aligned metadata. */
  accessories?: Accessory[];
  /** Ordered action list. First action = default (Enter). */
  actions: KitAction[];
  /** Inline preview data. */
  preview?: KitPreview;
  /** Relevance score. */
  score?: number;
}
