/// <reference types="vite/client" />

interface FlintAPI {
  platform: string

  chatSend: (prompt: string) => void
  onChatDelta: (callback: (delta: string) => void) => () => void
  onChatDone: (callback: () => void) => () => void

  getMeetings: () => Promise<unknown[]>
  joinMeeting: (joinUrl: string) => void
  onMeetingsUpdate: (callback: (meetings: unknown[]) => void) => () => void

  getConfig: () => Promise<unknown>
  setConfig: (partial: Record<string, unknown>) => void

  hideOverlay: () => void

  onConnectionStatus: (callback: (status: string) => void) => () => void
}

interface Window {
  flint?: FlintAPI
}
