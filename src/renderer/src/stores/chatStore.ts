import { create } from "zustand";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  addUserMessage: (content: string) => void;
  appendDelta: (delta: string) => void;
  finishStreaming: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  streamingContent: "",
  isStreaming: false,
  addUserMessage: (content) => {
    set((state) => ({
      messages: [...state.messages, { role: "user", content }],
      streamingContent: "",
      isStreaming: true,
    }));
  },
  appendDelta: (delta) => {
    set((state) => ({ streamingContent: state.streamingContent + delta }));
  },
  finishStreaming: () => {
    set((state) => ({
      messages: [...state.messages, { role: "assistant", content: state.streamingContent }],
      streamingContent: "",
      isStreaming: false,
    }));
  },
  clearMessages: () => {
    set({ messages: [], streamingContent: "", isStreaming: false });
  },
}));
