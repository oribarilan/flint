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
  monitored_servers: [],
};

// ---------------------------------------------------------------------------
// Mock search results
// ---------------------------------------------------------------------------

function makeMockResults(query: string): KitSearchResult[] {
  if (!query || query.length < 2) return [];

  const items = [
    {
      title: "README.md",
      subtitle: "~/projects/flint/README.md",
      kind: { type: "File" } as const,
    },
    {
      title: "package.json",
      subtitle: "~/projects/flint/package.json",
      kind: { type: "File" } as const,
    },
    {
      title: "Visual Studio Code",
      subtitle: "/Applications/Visual Studio Code.app",
      kind: { type: "Application" } as const,
    },
    {
      title: "Terminal",
      subtitle: "/Applications/Utilities/Terminal.app",
      kind: { type: "Application" } as const,
    },
    {
      title: "Safari",
      subtitle: "/Applications/Safari.app",
      kind: { type: "Application" } as const,
    },
    {
      title: "Notes",
      subtitle: "/Applications/Notes.app",
      kind: { type: "Application" } as const,
    },
    {
      title: "Calculator",
      subtitle: "Kit command",
      kind: {
        type: "Command",
        kit_id: "calculator",
        command_id: "calculate",
        mode: "InputResults",
      } as const,
    },
  ];

  const lower = query.toLowerCase();
  return items
    .filter((item) => item.title.toLowerCase().includes(lower))
    .map((item, i) => ({
      kitId: "core",
      id: `sim-${i}`,
      title: item.title,
      subtitle: item.subtitle,
      kind: item.kind,
      actions:
        item.kind.type === "Command"
          ? [{ type: "ActivateCommand" as const, kit_id: "calculator", command_id: "calculate" }]
          : [
              { type: "Open" as const, target: item.subtitle },
              { type: "RevealInFileManager" as const, target: item.subtitle },
            ],
      score: 100 - i * 10,
    }));
}

function makeSessionResults(state: SimState, query: string): KitSearchResult[] {
  const needle = query.trim().toLowerCase();
  const out: KitSearchResult[] = [];

  for (const server of state.monitoredServers) {
    for (const session of server.sessions) {
      if (
        needle.length > 0 &&
        !session.title.toLowerCase().includes(needle) &&
        !(server.label ?? server.id).toLowerCase().includes(needle)
      ) {
        continue;
      }

      out.push({
        kitId: "sessions",
        kitName: "Sessions",
        id: `session:${server.id}:${session.sessionId}`,
        title: session.title,
        subtitle: server.label ?? `${server.host}:${String(server.port)}`,
        kind: { type: "File" },
        accessories: [
          {
            type: "Badge",
            text: session.status[0]?.toUpperCase() + session.status.slice(1),
            color:
              session.status === "working"
                ? "var(--color-success)"
                : session.status === "waiting"
                  ? "var(--color-warning)"
                  : session.status === "error"
                    ? "var(--color-error)"
                    : "var(--text-placeholder)",
          },
        ],
        actions: [
          {
            type: "Copy",
            text: `${session.title} — ${server.label ?? server.id}`,
            label: "Copy summary",
          },
        ],
        score: 100,
      });
    }
  }

  return out.slice(0, 20);
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
    search_command: (args) => {
      const kitId = (args?.kitId as string) ?? "";
      const query = (args?.query as string) ?? "";
      if (kitId === "sessions") {
        return makeSessionResults(state, query);
      }
      return [];
    },

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

    get_kit_manifests: () =>
      [
        {
          id: "sessions",
          name: "Sessions",
          description: "Monitor OpenCode sessions across servers",
          icon: { type: "Emoji", value: "🗂️" },
          enabled: true,
          commands: [
            {
              id: "sessions",
              name: "Sessions",
              description: "Monitor OpenCode sessions",
              mode: "InputResults",
              enabled: true,
              default_prefix: "s ",
              effective_prefix: "s ",
              effective_hotkey: null,
            },
          ],
        },
      ] satisfies KitManifestInfo[],
    execute_command: () => ({ type: "Done" }),
    handle_custom_action: () => null,
  };
}
