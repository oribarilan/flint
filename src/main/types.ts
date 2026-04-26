export interface Meeting {
  id: string;
  title: string;
  startTime: string; // ISO 8601 — serializable over IPC
  endTime: string;
  attendees: string[];
  organizer: string;
  joinUrl?: string;
  agenda?: string;
}

export type PollFrequency = "relaxed" | "normal" | "aggressive";

export type FontSize = "extra-small" | "small" | "medium" | "large";

export interface FlintConfig {
  hotkey: string;
  alertMinutes: number;
  launchAtLogin: boolean;
  showTrayIcon: boolean;
  model: string;
  pollEnabled: boolean;
  pollFrequency: PollFrequency;
  pollModel: string;
  fontSize: FontSize;
}

export const DEFAULT_CONFIG: FlintConfig = {
  hotkey: "Ctrl+Shift+Space",
  alertMinutes: 5,
  launchAtLogin: true,
  showTrayIcon: true,
  model: "gpt-4.1",
  pollEnabled: true,
  pollFrequency: "normal",
  pollModel: "gpt-4.1-mini",
  fontSize: "medium",
};

export interface AttentionItem {
  id: string;
  icon: string; // Lucide icon name (calendar, message-circle, mail, file-text)
  title: string;
  description: string;
  timestamp?: string; // ISO 8601 — for time badge display
  openAction?: {
    type: "url";
    url: string;
  };
  metadata: Record<string, string>; // Context injected into chat on selection
}

export interface ModelInfo {
  id: string;
  name: string;
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
