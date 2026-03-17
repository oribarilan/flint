import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

export interface ActiveToolCall {
  kitId: string | null;
  toolName: string;
}

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

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentResponse: string;
  activeToolCalls: ActiveToolCall[];
  chatStatus: { connected: boolean; sessionId: string | null; repoPath: string | null };
  selectedModel: SelectedModel | null;
  modelPickerOpen: boolean;
  availableModels: AvailableModelEntry[];
  modelPickerQuery: string;
  modelPickerIndex: number;

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
  setModelPickerQuery: (query: string) => void;
  setModelPickerIndex: (index: number) => void;
  addToolCall: (call: ActiveToolCall) => void;
  removeToolCall: (toolName: string) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentResponse: "",
  activeToolCalls: [],
  chatStatus: { connected: false, sessionId: null, repoPath: null },
  selectedModel: null,
  modelPickerOpen: false,
  availableModels: [],
  modelPickerQuery: "",
  modelPickerIndex: 0,

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
    set({ chatStatus: status });
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

  setModelPickerQuery: (query) => {
    set({ modelPickerQuery: query, modelPickerIndex: 0 });
  },

  setModelPickerIndex: (index) => {
    set({ modelPickerIndex: index });
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

  clearChat: () => {
    set({ messages: [], isStreaming: false, currentResponse: "", activeToolCalls: [] });
  },
}));
