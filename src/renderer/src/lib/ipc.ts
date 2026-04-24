import type { Meeting, FlintConfig, ConnectionStatus, AttentionItem } from '../../../main/types'

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
  getAttentionItems: () => Promise<AttentionItem[]>
  onAttentionUpdate: (callback: (items: AttentionItem[]) => void) => () => void
  openAttentionItem: (id: string) => void
}

declare global {
  interface Window {
    flint: FlintAPI
  }
}

export const flint = window.flint
