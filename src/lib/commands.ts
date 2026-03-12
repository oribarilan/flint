import { invoke } from "@tauri-apps/api/core";

export async function hideWindow(): Promise<void> {
  return invoke("hide_window");
}

export async function showWindow(): Promise<void> {
  return invoke("show_window");
}

export async function toggleWindow(): Promise<void> {
  return invoke("toggle_window");
}
