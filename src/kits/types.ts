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
  | { type: "Custom"; id: string; label: string; requires_confirmation?: boolean }
  | { type: "Paste"; text: string }
  | { type: "ActivateCommand"; kit_id: string; command_id: string }
  | { type: "RevealInFileManager"; target: string }
  | { type: "CopyPath"; path: string }
  | { type: "CopyName"; name: string }
  | { type: "Delete"; target: string }
  | { type: "OpenInEditor"; target: string };

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
// Result kind
// ---------------------------------------------------------------------------

/** What kind of entity a search result represents. */
export type ResultKind =
  | { type: "Application" }
  | { type: "File" }
  | { type: "Directory" }
  | { type: "Command"; kit_id: string; command_id: string; mode: CommandMode };

export type CommandMode = "InputResults" | "Execute";

// ---------------------------------------------------------------------------
// Active command (chip state)
// ---------------------------------------------------------------------------

/** The currently active command chip in the search bar. */
export interface ActiveCommand {
  kitId: string;
  commandId: string;
  name: string;
  icon?: KitIcon;
}

// ---------------------------------------------------------------------------
// Search result (unified IPC type)
// ---------------------------------------------------------------------------

/** Unified search result from both core file search and kits. */
export interface KitSearchResult {
  /** `"core"` for file search, kit id otherwise. */
  kitId: string;
  /** Human-readable kit name (e.g., `"Calculator"`). Absent for core results. */
  kitName?: string;
  /** Unique within the kit. */
  id: string;
  /** Primary display text. */
  title: string;
  /** Secondary text (path, description). */
  subtitle?: string;
  /** Result icon. */
  icon?: KitIcon;
  /** What kind of result this is. */
  kind: ResultKind;
  /** Right-aligned metadata. */
  accessories?: Accessory[];
  /** Ordered action list. First action = default (Enter). */
  actions: KitAction[];
  /** Inline preview data. */
  preview?: KitPreview;
  /** Relevance score. */
  score?: number;
}
