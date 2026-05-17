import type { FlintConfig, ConnectionStatus, AttentionItem, ModelInfo } from "../../../main/types";

interface FlintAPI {
  platform: string;
  chatSend: (prompt: string) => void;
  chatReset: () => Promise<void>;
  onChatDelta: (callback: (delta: string) => void) => () => void;
  onChatDone: (callback: () => void) => () => void;
  getConfig: () => Promise<FlintConfig>;
  setConfig: (partial: Partial<FlintConfig>) => void;
  hideOverlay: () => void;
  onConnectionStatus: (callback: (status: ConnectionStatus) => void) => () => void;
  getAttentionItems: () => Promise<AttentionItem[]>;
  onAttentionUpdate: (callback: (items: AttentionItem[]) => void) => () => void;
  openAttentionItem: (id: string) => void;
  openLink: (url: string) => void;
  testNotification: () => void;
  listModels: () => Promise<ModelInfo[]>;
  setModel: (id: string) => void;
  onModelChanged: (callback: (modelId: string) => void) => () => void;
  onThemeChanged: (callback: (theme: string) => void) => () => void;
  onSpotlightShow: (callback: (meeting: unknown) => void) => () => void;
  spotlightDismiss: () => void;
  spotlightJoin: (joinUrl: string) => void;
}

declare global {
  interface Window {
    flint: FlintAPI | undefined;
  }
}
