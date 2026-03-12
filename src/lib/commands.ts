import { invoke } from "@tauri-apps/api/core";
import type { SearchResult } from "../stores/searchStore";

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

export async function openFile(path: string): Promise<void> {
  return invoke("open_file", { path });
}
