import type { Meeting, FlintConfig, ConnectionStatus } from '../../../main/types'

interface FlintAPI {
  platform: string
  chatSend: (prompt: string) => void
  onChatDelta: (callback: (delta: string) => void) => () => void
  onChatDone: (callback: () => void) => () => void
  getMeetings: () => Promise<Meeting[]>
  joinMeeting: (joinUrl: string) => void
  onMeetingsUpdate: (callback: (meetings: Meeting[]) => void) => () => void
  getConfig: () => Promise<FlintConfig>
  setConfig: (partial: Partial<FlintConfig>) => void
  hideOverlay: () => void
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => () => void
}

declare global {
  interface Window {
    flint: FlintAPI
  }
}

export const flint = window.flint
