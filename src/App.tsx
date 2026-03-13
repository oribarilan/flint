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

const AI_PREFIX = "/ai ";

export default function App() {
  useSearch();
  useChat();

  const searchBarRef = useRef<HTMLInputElement | null>(null);
  const query = useSearchStore((s) => s.query);
  const clearSearch = useSearchStore((s) => s.clearSearch);

  const authStatus = useChatStore((s) => s.authStatus);
  const setAuthStatus = useChatStore((s) => s.setAuthStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const messages = useChatStore((s) => s.messages);
  const isChatMode = query.toLowerCase().startsWith(AI_PREFIX) || query.toLowerCase() === "/ai";
  const hasChatContent = messages.length > 0 || isStreaming;

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

    const text = query.startsWith(AI_PREFIX)
      ? query.slice(AI_PREFIX.length).trim()
      : query.replace(/^\/ai\s*/i, "").trim();

    if (text.length === 0) return;

    addUserMessage(text);
    sendChatMessage(text).catch((err: unknown) => {
      console.error("Failed to send chat message:", err);
    });
  }, [query, isStreaming, addUserMessage]);

  // Focus the search bar (used when returning from results list)
  const focusSearchBar = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>("input[aria-label='Search']");
    input?.focus();
  }, []);

  // Global Escape handler: hide window when query is empty
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && query.length === 0) {
        hideWindow().catch(() => {
          // Window hide is best-effort
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [query]);

  // Tauri window events: blur → hide, focus → clear & refocus
  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    const setup = async () => {
      const appWindow = getCurrentWebviewWindow();

      const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          // Don't hide window during active auth flow
          if (!useChatStore.getState().isAuthenticating) {
            void hideWindow();
          }
        } else {
          refreshAuth();
          focusSearchBar();
          // Only clear search if no active chat session
          if (useChatStore.getState().messages.length === 0) {
            clearSearch();
          }
        }
      });

      unlistenFocus = unlisten;
    };

    void setup();
    return () => unlistenFocus?.();
  }, [clearSearch, focusSearchBar, refreshAuth]);

  const showAuthPrompt = isChatMode && !authStatus.authenticated;
  const showChat = (isChatMode || hasChatContent) && authStatus.authenticated;
  const showResults = !isChatMode && !hasChatContent;

  return (
    <div className={styles.launcher} ref={searchBarRef}>
      <SearchBar
        onArrowDown={() => {
          const list = document.querySelector<HTMLDivElement>("[role='listbox']");
          list?.focus();
        }}
        chatMode={isChatMode || hasChatContent}
        onSendChat={handleSendChat}
      />
      {showAuthPrompt && <AuthPrompt />}
      {showChat && <ChatPanel />}
      {showResults && <ResultsList onEscape={focusSearchBar} />}
    </div>
  );
}
