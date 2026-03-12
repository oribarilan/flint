import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentResponse: string;
  authStatus: { authenticated: boolean; username: string | null };

  addUserMessage: (content: string) => void;
  appendToken: (token: string) => void;
  finishResponse: () => void;
  setError: (error: string) => void;
  setStreaming: (streaming: boolean) => void;
  setAuthStatus: (status: { authenticated: boolean; username: string | null }) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentResponse: "",
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

  setAuthStatus: (status) => {
    set({ authStatus: status });
  },

  clearChat: () => {
    set({ messages: [], isStreaming: false, currentResponse: "" });
  },
}));
