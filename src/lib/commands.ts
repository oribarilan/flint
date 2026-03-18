import { invoke } from "@tauri-apps/api/core";
import type { SearchResult } from "../stores/searchStore";
import type { CommandMode, KitIcon, KitSearchResult } from "../kits/types";

export async function hideWindow(): Promise<void> {
  return invoke("hide_window");
}

export async function showWindow(): Promise<void> {
  return invoke("show_window");
}

export async function toggleWindow(): Promise<void> {
  return invoke("toggle_window");
}

export async function searchFiles(query: string): Promise<SearchResult[]> {
  return invoke("search_files", { query });
}

export async function searchAll(query: string): Promise<KitSearchResult[]> {
  return invoke("search_all", { query });
}

export async function openFile(path: string): Promise<void> {
  return invoke("open_file", { path });
}

export async function getAppIcon(path: string): Promise<string | null> {
  return invoke("get_app_icon", { path });
}

export async function openSettings(): Promise<void> {
  return invoke("open_settings");
}

// ── Chat commands ──────────────────────────────────────────────

export interface ChatStatus {
  connected: boolean;
  session_id: string | null;
  repo_path: string | null;
}

export async function getChatStatus(): Promise<ChatStatus> {
  return invoke("get_chat_status");
}

export async function sendChatMessage(
  message: string,
  providerId?: string,
  modelId?: string,
): Promise<void> {
  return invoke("send_chat_message", { message, providerId, modelId });
}

export interface AvailableModel {
  id: string;
  name: string;
  provider_id: string;
  provider_name: string;
}

export async function getAvailableModels(): Promise<[AvailableModel[], string | null]> {
  return invoke("get_available_models");
}

export async function abortChat(): Promise<void> {
  return invoke("abort_chat");
}

export async function clearChat(): Promise<void> {
  return invoke("clear_chat");
}

export async function initOpencode(): Promise<void> {
  return invoke("init_opencode");
}

// ── Config commands ────────────────────────────────────────────

export interface GeneralConfig {
  hotkey: string;
  launch_at_login: boolean;
  terminal: string;
  editor: string;
}

export interface AppearanceConfig {
  font_size: string;
  theme: string;
  backdrop_blur: boolean;
}

export interface SearchConfig {
  directories: string[];
}

export interface ChatConfig {
  default_model: string;
}

export interface SecondBrainConfig {
  repo_path: string | null;
}

export interface CommandConfigEntry {
  enabled?: boolean;
  prefix?: string;
  hotkey?: string;
}

export interface KitConfig {
  enabled: boolean;
  commands?: Record<string, CommandConfigEntry>;
  [key: string]: unknown;
}

export interface FlintConfig {
  general: GeneralConfig;
  appearance: AppearanceConfig;
  search: SearchConfig;
  chat: ChatConfig;
  second_brain: SecondBrainConfig;
  kits: Record<string, KitConfig>;
}

export async function getConfig(): Promise<FlintConfig> {
  return invoke("get_config");
}

export async function getDefaultConfig(): Promise<FlintConfig> {
  return invoke("get_default_config");
}

export async function updateConfig(config: FlintConfig): Promise<void> {
  return invoke("update_config", { newConfig: config });
}

// ── Action Panel commands ──────────────────────────────────────

export async function revealInFileManager(path: string): Promise<void> {
  return invoke("reveal_in_file_manager", { path });
}

export async function deleteToTrash(path: string): Promise<void> {
  return invoke("delete_to_trash", { path });
}

export async function openInEditor(path: string): Promise<void> {
  return invoke("open_in_editor", { path });
}

export async function openInTerminal(path: string): Promise<void> {
  return invoke("open_in_terminal", { path });
}

// ── Kit commands ───────────────────────────────────────────

export interface CommandInfo {
  id: string;
  name: string;
  description: string;
  mode: CommandMode;
  enabled: boolean;
  default_prefix: string | null;
  effective_prefix: string | null;
  effective_hotkey: string | null;
}

export interface KitManifestInfo {
  id: string;
  name: string;
  description: string;
  icon: KitIcon;
  enabled: boolean;
  commands: CommandInfo[];
}

export async function getKitManifests(): Promise<KitManifestInfo[]> {
  return invoke("get_kit_manifests");
}

export async function searchCommand(
  kitId: string,
  commandId: string,
  query: string,
): Promise<KitSearchResult[]> {
  return invoke("search_command", { kitId, commandId, query });
}

export async function executeCommand(
  kitId: string,
  commandId: string,
): Promise<{ type: "Done" } | { type: "Message"; text: string }> {
  return invoke("execute_command", { kitId, commandId });
}

export async function handleCustomAction(kitId: string, actionId: string): Promise<string | null> {
  return invoke("handle_custom_action", { kitId, actionId });
}
