import { useCallback, useEffect, useMemo } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import SearchBar from "./components/SearchBar";
import ResultsList, { executeDefaultAction, executeActionFromPanel } from "./components/ResultsList";
import ActionPanel from "./components/ActionPanel";
import ChatPanel from "./components/ChatPanel";
import AuthPrompt from "./components/AuthPrompt";
import HintBar from "./components/HintBar";
import { useSearchStore, actionRequiresConfirmation } from "./stores/searchStore";
import { useChatStore } from "./stores/chatStore";
import { hideWindow, getAuthStatus, sendChatMessage, getConfig } from "./lib/commands";
import { focusSearchBar, shouldHideOnBlur } from "./lib/focus";
import { applyFontSize, applyTheme, applyBackdropBlur } from "./lib/applyTheme";
import { useSearch } from "./hooks/useSearch";
import { usePrefixDetection } from "./hooks/usePrefixDetection";
import { useChat } from "./hooks/useChat";
import { useCommandActivation } from "./hooks/useCommandActivation";
import { useKeybindings } from "./hooks/useKeybindings";
import { useActionPanelDebug } from "./hooks/useActionPanelDebug";
import styles from "./App.module.css";

export default function App() {
  useSearch();
  usePrefixDetection();
  useChat();
  useCommandActivation();
  useActionPanelDebug();

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
            void hideWindow().catch((err: unknown) => {
              console.warn("Failed to hide window:", err);
            });
          }
          // Clear state eagerly on blur so the window is clean when reopened.
          // Preserve active chat sessions and command chips across hide/show.
          const hasChat = useChatStore.getState().messages.length > 0;
          const hasActiveCommand = useSearchStore.getState().activeCommand !== null;
          if (!hasChat && !hasActiveCommand) {
            useSearchStore.getState().clearSearch();
          }
        } else {
          refreshAuth();
          focusSearchBar();
          // Re-apply appearance in case settings changed in another window
          getConfig()
            .then((cfg) => {
              applyFontSize(cfg.appearance.font_size);
              applyTheme(cfg.appearance.theme);
              applyBackdropBlur(cfg.appearance.backdrop_blur);
            })
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            .catch(() => {});
        }
      });

      unlistenFocus = unlisten;
    };

    void setup().catch((err: unknown) => {
      console.error("Failed to setup window focus listener:", err);
    });
    return () => unlistenFocus?.();
  }, [focusSearchBar, refreshAuth]);

  const showAuthPrompt = isChatMode && !authStatus.authenticated;
  const showChat = isChatMode && authStatus.authenticated;
  const actionPanelOpen = useSearchStore((s) => s.actionPanelOpen);
  const showResults = !isChatMode && !actionPanelOpen;
  const showActionPanel = !isChatMode && actionPanelOpen;

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
          const state = useSearchStore.getState();

          // Action Panel: execute selected action
          if (state.actionPanelOpen) {
            const actions = state.getFilteredActions();
            const action = actions[state.selectedActionIndex];
            if (!action) return;

            if (actionRequiresConfirmation(action)) {
              if (state.armedActionIndex === state.selectedActionIndex) {
                state.closeActionPanel();
                executeActionFromPanel(action);
              } else {
                state.armAction(state.selectedActionIndex);
              }
            } else {
              state.closeActionPanel();
              executeActionFromPanel(action);
            }
            return;
          }

          // Normal: execute default action
          const { results, selectedIndex } = state;
          const result = results[selectedIndex];
          if (result) executeDefaultAction(result);
        }}
      />
      {showAuthPrompt && <AuthPrompt />}
      {showChat && <ChatPanel />}
      {showActionPanel && <ActionPanel />}
      {showResults && <ResultsList />}
      <HintBar />
    </div>
  );
}
