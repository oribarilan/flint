import { useCallback, useEffect, useMemo } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import SearchBar from "./components/SearchBar";
import ResultsList, {
  executeDefaultAction,
  executeActionFromPanel,
} from "./components/ResultsList";
import ActionPanel from "./components/ActionPanel";
import ChatPanel from "./components/ChatPanel";
import HintBar from "./components/HintBar";
import { useSearchStore, actionRequiresConfirmation } from "./stores/searchStore";
import { useChatStore } from "./stores/chatStore";
import { hideWindow, getChatStatus, sendChatMessage, getConfig } from "./lib/commands";
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

  const setChatStatus = useChatStore((s) => s.setChatStatus);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const isAgentMode = mode === "agent";

  // Check chat connection status on mount and on focus
  const refreshChatStatus = useCallback(() => {
    getChatStatus()
      .then((status) => {
        setChatStatus({
          connected: status.connected,
          sessionId: status.session_id,
          repoPath: status.repo_path,
        });
      })
      .catch(() => {
        // Status check is best-effort
      });
  }, [setChatStatus]);

  useEffect(() => {
    refreshChatStatus();
  }, [refreshChatStatus]);

  // Send a chat message
  const handleSendChat = useCallback(() => {
    if (isStreaming) return;

    const text = query.trim();
    if (text.length === 0) return;

    addUserMessage(text);
    useSearchStore.getState().setQuery("");
    const model = useChatStore.getState().selectedModel;
    sendChatMessage(text, model?.providerId, model?.modelId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to send message";
      useChatStore.getState().setError(message);
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
          refreshChatStatus();
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
  }, [focusSearchBar, refreshChatStatus]);

  const showChat = isAgentMode;
  const actionPanelOpen = useSearchStore((s) => s.actionPanelOpen);
  const showResults = !isAgentMode && !actionPanelOpen;
  const showActionPanel = !isAgentMode && actionPanelOpen;

  return (
    <div className={[styles.launcher, isAgentMode && styles.agentMode].filter(Boolean).join(" ")}>
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
      {showChat && <ChatPanel />}
      {showActionPanel && <ActionPanel />}
      {showResults && <ResultsList />}
      <HintBar />
    </div>
  );
}
