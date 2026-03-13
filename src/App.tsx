import { useCallback, useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import SearchBar from "./components/SearchBar";
import ResultsList from "./components/ResultsList";
import ChatPanel from "./components/ChatPanel";
import AuthPrompt from "./components/AuthPrompt";
import { useSearchStore } from "./stores/searchStore";
import { useChatStore } from "./stores/chatStore";
import { hideWindow, getAuthStatus, sendChatMessage } from "./lib/commands";
import { useSearch } from "./hooks/useSearch";
import { useChat } from "./hooks/useChat";
import styles from "./App.module.css";

export default function App() {
  useSearch();
  useChat();

  const searchBarRef = useRef<HTMLInputElement | null>(null);
  const query = useSearchStore((s) => s.query);
  const mode = useSearchStore((s) => s.mode);
  const toggleMode = useSearchStore((s) => s.toggleMode);

  const authStatus = useChatStore((s) => s.authStatus);
  const setAuthStatus = useChatStore((s) => s.setAuthStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const isChatMode = mode === "chat";

  // Check auth status on mount and on focus
  const refreshAuth = useCallback(() => {
    getAuthStatus()
      .then(setAuthStatus)
      .catch(() => {
        // Auth check is best-effort
      });
  }, [setAuthStatus]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Send a chat message
  const handleSendChat = useCallback(() => {
    if (isStreaming) return;

    const text = query.trim();
    if (text.length === 0) return;

    addUserMessage(text);
    sendChatMessage(text).catch((err: unknown) => {
      console.error("Failed to send chat message:", err);
    });
  }, [query, isStreaming, addUserMessage]);

  // Global Tab handler: toggle between search and chat mode
  useEffect(() => {
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        toggleMode();
      }
    };
    window.addEventListener("keydown", handleTabKey);
    return () => {
      window.removeEventListener("keydown", handleTabKey);
    };
  }, [toggleMode]);

  // Focus the search bar (used when returning from results list)
  const focusSearchBar = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>("input[aria-label='Search']");
    input?.focus();
  }, []);

  // Global layered Escape handler — one layer per press:
  // 1. Input has text → clear input
  // 2. Chat session active → clear chat, return to search
  // 3. Empty search mode → dismiss window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();

      // Layer 1: clear input text (preserve current mode)
      if (useSearchStore.getState().query.length > 0) {
        useSearchStore.setState({
          query: "",
          results: [],
          selectedIndex: 0,
          isLoading: false,
        });
        return;
      }

      // Layer 2: clear chat session, return to search mode
      const hasChat = useChatStore.getState().messages.length > 0;
      const inChatMode = useSearchStore.getState().mode === "chat";
      if (hasChat || inChatMode) {
        useChatStore.getState().clearChat();
        useSearchStore.getState().setMode("search");
        return;
      }

      // Layer 3: dismiss window
      hideWindow().catch(() => {
        // Window hide is best-effort
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Tauri window events: blur → hide, focus → clear & refocus
  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    const setup = async () => {
      const appWindow = getCurrentWebviewWindow();

      const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          void hideWindow();
        } else {
          refreshAuth();
          focusSearchBar();
          // Preserve active chat sessions across hide/show
          const hasChat = useChatStore.getState().messages.length > 0;
          if (!hasChat) {
            useSearchStore.getState().clearSearch();
          }
        }
      });

      unlistenFocus = unlisten;
    };

    void setup();
    return () => unlistenFocus?.();
  }, [focusSearchBar, refreshAuth]);

  const showAuthPrompt = isChatMode && !authStatus.authenticated;
  const showChat = isChatMode && authStatus.authenticated;
  const showResults = !isChatMode;

  return (
    <div className={styles.launcher} ref={searchBarRef}>
      <SearchBar
        onArrowDown={() => {
          const list = document.querySelector<HTMLDivElement>("[role='listbox']");
          list?.focus();
        }}
        onSendChat={handleSendChat}
      />
      {showAuthPrompt && <AuthPrompt />}
      {showChat && <ChatPanel />}
      {showResults && <ResultsList onEscape={focusSearchBar} />}
    </div>
  );
}
