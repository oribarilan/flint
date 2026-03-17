/**
 * Platform mock handlers — always used regardless of simulator mode.
 *
 * Covers Tauri window management, file operations, search, config,
 * app icons, and kit manifests.
 */

import type { FlintConfig, KitManifestInfo } from "../src/lib/commands";
import type { KitSearchResult } from "../src/kits/types";
import type { SimState, CommandHandlerMap } from "./types";

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: FlintConfig = {
  general: {
    hotkey: "CmdOrCtrl+Shift+Space",
    launch_at_login: false,
    terminal: "auto",
    editor: "auto",
  },
  appearance: {
    font_size: "small",
    theme: "flint",
    backdrop_blur: false,
  },
  search: { directories: ["~"] },
  chat: { default_model: "anthropic/claude-sonnet-4" },
  second_brain: { repo_path: null },
  kits: {},
};

// ---------------------------------------------------------------------------
// Mock search results
// ---------------------------------------------------------------------------

function makeMockResults(query: string): KitSearchResult[] {
  if (!query || query.length < 2) return [];

  const items = [
    { title: "README.md", subtitle: "~/projects/flint/README.md", kind: "File" },
    { title: "package.json", subtitle: "~/projects/flint/package.json", kind: "File" },
    {
      title: "Visual Studio Code",
      subtitle: "/Applications/Visual Studio Code.app",
      kind: "Application",
    },
    { title: "Terminal", subtitle: "/Applications/Utilities/Terminal.app", kind: "Application" },
    { title: "Safari", subtitle: "/Applications/Safari.app", kind: "Application" },
    { title: "Notes", subtitle: "/Applications/Notes.app", kind: "Application" },
    { title: "Calculator", subtitle: "Kit command", kind: "Command" },
  ];

  const lower = query.toLowerCase();
  return items
    .filter((item) => item.title.toLowerCase().includes(lower))
    .map((item, i) => ({
      kitId: "core",
      id: `sim-${i}`,
      title: item.title,
      subtitle: item.subtitle,
      kind: item.kind as KitSearchResult["kind"],
      actions: [{ type: "Open" as const }, { type: "RevealInFileManager" as const }],
      score: 100 - i * 10,
    }));
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createPlatformHandlers(state: SimState): CommandHandlerMap {
  return {
    hide_window: () => {
      console.log("[sim] hide_window()");
    },
    show_window: () => {
      console.log("[sim] show_window()");
    },
    toggle_window: () => {
      console.log("[sim] toggle_window()");
    },
    open_settings: () => {
      console.log("[sim] open_settings()");
    },

    search_files: () => [],
    search_all: (args) => makeMockResults((args?.query as string) ?? ""),
    search_command: () => [],

    get_config: () => structuredClone(state.config),
    get_default_config: () => structuredClone(DEFAULT_CONFIG),
    update_config: (args) => {
      state.config = structuredClone(args?.newConfig as FlintConfig);
      console.log("[sim] config updated");
    },

    open_file: (args) => {
      console.log(`[sim] open_file(${args?.path})`);
    },
    reveal_in_file_manager: (args) => {
      console.log(`[sim] reveal_in_file_manager(${args?.path})`);
    },
    delete_to_trash: (args) => {
      console.log(`[sim] delete_to_trash(${args?.path})`);
    },
    open_in_editor: (args) => {
      console.log(`[sim] open_in_editor(${args?.path})`);
    },
    open_in_terminal: (args) => {
      console.log(`[sim] open_in_terminal(${args?.path})`);
    },

    get_app_icon: () => null,

    get_kit_manifests: () => [] satisfies KitManifestInfo[],
    execute_command: () => ({ type: "Done" }),
    handle_custom_action: () => null,
  };
}
