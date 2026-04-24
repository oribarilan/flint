export interface Meeting {
  id: string
  title: string
  startTime: string // ISO 8601 — serializable over IPC
  endTime: string
  attendees: string[]
  organizer: string
  joinUrl?: string
  agenda?: string
}

export interface FlintConfig {
  hotkey: string
  alertMinutes: number
  launchAtLogin: boolean
  showTrayIcon: boolean
}

export const DEFAULT_CONFIG: FlintConfig = {
  hotkey: 'Ctrl+Alt+CommandOrControl+Space',
  alertMinutes: 5,
  launchAtLogin: true,
  showTrayIcon: true,
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'
