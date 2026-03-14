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

// ── Auth commands ──────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}

export interface AuthStatus {
  authenticated: boolean;
  username: string | null;
}

export async function startCopilotAuth(): Promise<DeviceCodeResponse> {
  return invoke("start_copilot_auth");
}

export async function completeCopilotAuth(deviceCode: string, interval: number): Promise<void> {
  return invoke("complete_copilot_auth", { deviceCode, interval });
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return invoke("get_auth_status");
}

// ── Chat commands ──────────────────────────────────────────────

export async function sendChatMessage(message: string): Promise<void> {
  return invoke("send_chat_message", { message });
}

export async function signOut(): Promise<void> {
  return invoke("sign_out");
}

// ── Config commands ────────────────────────────────────────────

export interface GeneralConfig {
  hotkey: string;
  launch_at_login: boolean;
}

export interface AppearanceConfig {
  font_size: string;
  theme: string;
}

export interface SearchConfig {
  directories: string[];
  exclude: string[];
  max_depth: number;
}

export interface ChatConfig {
  default_model: string;
}

export interface CommandConfigEntry {
  enabled?: boolean;
  prefix?: string;
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

// ── Kit commands ───────────────────────────────────────────

export interface CommandInfo {
  id: string;
  name: string;
  description: string;
  mode: CommandMode;
  enabled: boolean;
  default_prefix: string | null;
  effective_prefix: string | null;
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
