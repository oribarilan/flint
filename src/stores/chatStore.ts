import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

export interface ActiveToolCall {
  kitId: string | null;
  toolName: string;
}

export interface SlashCommand {
  id: string;
  name: string;
  icon: "command";
}

export const SLASH_COMMANDS: SlashCommand[] = [{ id: "models", name: "Models", icon: "command" }];

export interface SelectedModel {
  providerId: string;
  modelId: string;
  displayName: string;
}

export interface AvailableModelEntry {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
}

/**
 * Filter and sort model entries for picker display.
 * Sort order: configured default model first, then alphabetical by name.
 */
export function filterAndSortModels(
  models: AvailableModelEntry[],
  query: string,
  defaultModelId: string | null,
): AvailableModelEntry[] {
  const lower = query.trim().toLowerCase();
  const filtered =
    lower.length === 0
      ? models
      : models.filter(
          (m) =>
            m.name.toLowerCase().includes(lower) ||
            m.providerName.toLowerCase().includes(lower) ||
            m.id.toLowerCase().includes(lower),
        );

  return [...filtered].sort((a, b) => {
    const aIsDefault = defaultModelId !== null && a.id === defaultModelId;
    const bIsDefault = defaultModelId !== null && b.id === defaultModelId;

    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentResponse: string;
  activeToolCalls: ActiveToolCall[];
  chatStatus: { connected: boolean; sessionId: string | null; repoPath: string | null };
  /** Whether `setChatStatus` has been called at least once (avoids flash of "not configured"). */
  statusChecked: boolean;
  selectedModel: SelectedModel | null;
  modelPickerOpen: boolean;
  availableModels: AvailableModelEntry[];
  defaultModelId: string | null;
  modelPickerQuery: string;
  modelPickerIndex: number;
  slashMenuOpen: boolean;
  slashMenuIndex: number;
  slashMenuDismissed: boolean;

  addUserMessage: (content: string) => void;
  appendToken: (token: string) => void;
  finishResponse: () => void;
  setError: (error: string) => void;
  setStreaming: (streaming: boolean) => void;
  setChatStatus: (status: {
    connected: boolean;
    sessionId: string | null;
    repoPath: string | null;
  }) => void;
  setSelectedModel: (model: SelectedModel | null) => void;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  setAvailableModels: (models: AvailableModelEntry[]) => void;
  setDefaultModelId: (id: string | null) => void;
  setModelPickerQuery: (query: string) => void;
  setModelPickerIndex: (index: number) => void;
  openSlashMenu: () => void;
  closeSlashMenu: () => void;
  setSlashMenuIndex: (index: number) => void;
  setSlashMenuDismissed: (dismissed: boolean) => void;
  addToolCall: (call: ActiveToolCall) => void;
  removeToolCall: (toolName: string) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentResponse: "",
  activeToolCalls: [],
  chatStatus: { connected: false, sessionId: null, repoPath: null },
  statusChecked: false,
  selectedModel: null,
  modelPickerOpen: false,
  availableModels: [],
  defaultModelId: null,
  modelPickerQuery: "",
  modelPickerIndex: 0,
  slashMenuOpen: false,
  slashMenuIndex: 0,
  slashMenuDismissed: false,

  addUserMessage: (content) => {
    set((state) => ({
      messages: [...state.messages, { role: "user", content }],
      isStreaming: true,
      currentResponse: "",
    }));
  },

  appendToken: (token) => {
    set((state) => ({
      currentResponse: state.currentResponse + token,
    }));
  },

  finishResponse: () => {
    const { currentResponse } = get();
    if (currentResponse.length === 0) return;
    set((state) => ({
      messages: [...state.messages, { role: "assistant", content: currentResponse }],
      currentResponse: "",
      isStreaming: false,
    }));
  },

  setError: (error) => {
    set((state) => ({
      messages: [...state.messages, { role: "error", content: error }],
      currentResponse: "",
      isStreaming: false,
    }));
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },

  setChatStatus: (status) => {
    set({ chatStatus: status, statusChecked: true });
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
  },

  openModelPicker: () => {
    set({ modelPickerOpen: true, modelPickerQuery: "", modelPickerIndex: 0 });
  },

  closeModelPicker: () => {
    set({ modelPickerOpen: false, modelPickerQuery: "", modelPickerIndex: 0 });
  },

  setAvailableModels: (models) => {
    set({ availableModels: models });
  },

  setDefaultModelId: (id) => {
    set({ defaultModelId: id });
  },

  setModelPickerQuery: (query) => {
    set({ modelPickerQuery: query, modelPickerIndex: 0 });
  },

  setModelPickerIndex: (index) => {
    set({ modelPickerIndex: index });
  },

  openSlashMenu: () => {
    set({ slashMenuOpen: true, slashMenuIndex: 0 });
  },

  closeSlashMenu: () => {
    set({ slashMenuOpen: false });
  },

  setSlashMenuIndex: (index) => {
    set({ slashMenuIndex: index });
  },

  setSlashMenuDismissed: (dismissed) => {
    set({ slashMenuDismissed: dismissed });
  },

  addToolCall: (call) => {
    set((state) => ({
      activeToolCalls: [...state.activeToolCalls, call],
    }));
  },

  removeToolCall: (toolName) => {
    set((state) => ({
      activeToolCalls: state.activeToolCalls.filter((tc) => tc.toolName !== toolName),
    }));
  },

  setMessages: (messages) => {
    set({ messages, isStreaming: false, currentResponse: "", activeToolCalls: [] });
  },

  clearChat: () => {
    set({ messages: [], isStreaming: false, currentResponse: "", activeToolCalls: [] });
  },
}));
