import { useCallback, useEffect, useMemo } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import SearchBar from "./components/SearchBar";
import ResultsList, { executeDefaultAction } from "./components/ResultsList";
import ChatPanel from "./components/ChatPanel";
import AuthPrompt from "./components/AuthPrompt";
import HintBar from "./components/HintBar";
import { useSearchStore } from "./stores/searchStore";
import { useChatStore } from "./stores/chatStore";
import { hideWindow, getAuthStatus, sendChatMessage, getConfig } from "./lib/commands";
import { focusSearchBar, shouldHideOnBlur } from "./lib/focus";
import { applyFontSize, applyTheme } from "./lib/applyTheme";
import { useSearch } from "./hooks/useSearch";
import { useChat } from "./hooks/useChat";
import { useKeybindings } from "./hooks/useKeybindings";
import styles from "./App.module.css";

export default function App() {
  useSearch();
  useChat();

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
    useSearchStore.getState().setQuery("");
    sendChatMessage(text).catch((err: unknown) => {
      console.error("Failed to send chat message:", err);
    });
  }, [query, isStreaming, addUserMessage]);

  // Open the Nth search result directly (no-op if out of bounds)
  const handleOpenResult = useCallback((index: number) => {
    const { results } = useSearchStore.getState();
    const result = results[index];
    if (!result) return;
    executeDefaultAction(result);
  }, []);

  // Centralized keyboard handler
  const keybindingActions = useMemo(
    () => ({
      onToggleMode: toggleMode,
      onFocusSearchBar: focusSearchBar,
      onOpenResult: handleOpenResult,
    }),
    [toggleMode, handleOpenResult],
  );
  useKeybindings(keybindingActions);

  // Tauri window events: blur → hide, focus → clear & refocus
  useEffect(() => {
    let unlistenFocus: (() => void) | undefined;

    const setup = async () => {
      const appWindow = getCurrentWebviewWindow();

      const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          if (shouldHideOnBlur()) {
            void hideWindow();
          }
        } else {
          refreshAuth();
          focusSearchBar();
          // Re-apply appearance in case settings changed in another window
          getConfig()
            .then((cfg) => {
              applyFontSize(cfg.appearance.font_size);
              applyTheme(cfg.appearance.theme);
            })
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            .catch(() => {});
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
    <div className={styles.launcher}>
      <SearchBar
        onArrowDown={() => {
          useSearchStore.getState().moveSelection("down");
        }}
        onArrowUp={() => {
          useSearchStore.getState().moveSelection("up");
        }}
        onSendChat={handleSendChat}
        onSubmitSearch={() => {
          const { results, selectedIndex } = useSearchStore.getState();
          const result = results[selectedIndex];
          if (result) executeDefaultAction(result);
        }}
      />
      {showAuthPrompt && <AuthPrompt />}
      {showChat && <ChatPanel />}
      {showResults && <ResultsList />}
      <HintBar />
    </div>
  );
}
