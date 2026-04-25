import type { FlintConfig, ConnectionStatus, AttentionItem } from '../../../main/types'

export interface ModelInfo {
  id: string
  name: string
}

interface FlintAPI {
  platform: string
  chatSend: (prompt: string) => void
  onChatDelta: (callback: (delta: string) => void) => () => void
  onChatDone: (callback: () => void) => () => void
  getConfig: () => Promise<FlintConfig>
  setConfig: (partial: Partial<FlintConfig>) => void
  hideOverlay: () => void
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => () => void
  getAttentionItems: () => Promise<AttentionItem[]>
  onAttentionUpdate: (callback: (items: AttentionItem[]) => void) => () => void
  openAttentionItem: (id: string) => void
  listModels: () => Promise<ModelInfo[]>
  setModel: (id: string) => void
  onModelChanged: (callback: (modelId: string) => void) => () => void
}

declare global {
  interface Window {
    flint: FlintAPI
  }
}

export const flint = window.flint
