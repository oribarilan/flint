import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

export interface ActiveToolCall {
  kitId: string | null;
  toolName: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  isAuthenticating: boolean;
  currentResponse: string;
  activeToolCalls: ActiveToolCall[];
  authStatus: { authenticated: boolean; username: string | null };

  addUserMessage: (content: string) => void;
  appendToken: (token: string) => void;
  finishResponse: () => void;
  setError: (error: string) => void;
  setStreaming: (streaming: boolean) => void;
  setAuthenticating: (authenticating: boolean) => void;
  setAuthStatus: (status: { authenticated: boolean; username: string | null }) => void;
  addToolCall: (call: ActiveToolCall) => void;
  removeToolCall: (toolName: string) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  isAuthenticating: false,
  currentResponse: "",
  activeToolCalls: [],
  authStatus: { authenticated: false, username: null },

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

  setAuthenticating: (authenticating) => {
    set({ isAuthenticating: authenticating });
  },

  setAuthStatus: (status) => {
    set({ authStatus: status });
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
