import { useEffect } from "react";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import {
  hideWindow,
  openSettings,
  clearChat as clearBackendChat,
  abortChat,
  getChatStatus,
} from "../lib/commands";
import { suppressNextBlurHide } from "../lib/focus";
import { isMac } from "../lib/platform";

/** Map of Ctrl+{key} → arrow key name for vim-style navigation. */
const VIM_ARROW_MAP: Record<string, string> = {
  h: "ArrowLeft",
  j: "ArrowDown",
  k: "ArrowUp",
  l: "ArrowRight",
};

/**
 * Re-dispatch a KeyboardEvent as a different key.
 * The synthetic event bubbles from the same target so downstream
 * listeners (ResultsList, SearchBar) handle it normally.
 */
function redispatchAsArrow(original: KeyboardEvent, arrowKey: string): void {
  const synthetic = new KeyboardEvent("keydown", {
    key: arrowKey,
    code: arrowKey,
    bubbles: true,
    cancelable: true,
  });
  original.target?.dispatchEvent(synthetic);
}

/** Check whether the platform meta-key (Cmd on Mac, Ctrl elsewhere) is held. */
function isCmdOrCtrl(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

async function syncChatStatusFromBackend(): Promise<void> {
  try {
    const status = await getChatStatus();
    useChatStore.getState().setChatStatus({
      connected: status.connected,
      sessionId: status.session_id,
      repoPath: status.repo_path,
    });
  } catch {
    // Best-effort sync only.
  }
}

async function clearBackendChatWithRetry(): Promise<void> {
  try {
    await clearBackendChat();
    await syncChatStatusFromBackend();
    return;
  } catch {
    useChatStore.getState().setNotice({
      level: "warning",
      message: "Chat reset failed. Retrying…",
    });
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      resolve();
    }, 200);
  });

  try {
    await clearBackendChat();
    await syncChatStatusFromBackend();
    useChatStore.getState().clearNotice();
  } catch {
    useChatStore.getState().setNotice({
      level: "warning",
      message: "Backend session may still contain old context. You can continue safely.",
    });
  }
}

interface KeybindingActions {
  onToggleMode: () => void;
  onFocusSearchBar: () => void;
  onOpenResult: (index: number) => void;
}

/**
 * Centralized global keydown listener.
 *
 * Owns: Tab, Escape (layered), Ctrl+HJKL (vim + Action Panel depth),
 * CmdOrCtrl+1..9, CmdOrCtrl+,
 * Components keep: Enter (context-dependent), ArrowDown in SearchBar (focus move).
 */
export function useKeybindings(actions: KeybindingActions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ── Ctrl+HJKL ──────────────────────────────────────────
      // H/L are push/pop for Action Panel depth.
      // J/K always re-dispatch as arrows.
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const key = e.key.toLowerCase();

        // Ctrl+L: push into Action Panel (when results are visible)
        if (key === "l") {
          const state = useSearchStore.getState();
          if (!state.actionPanelOpen && state.results.length > 0 && state.mode === "search") {
            e.preventDefault();
            state.openActionPanel();
            return;
          }
          // If panel is already open, no-op (already at deepest level)
          if (state.actionPanelOpen) {
            e.preventDefault();
            return;
          }
        }

        // Ctrl+H: pop out of Action Panel (back to results)
        if (key === "h") {
          if (useSearchStore.getState().actionPanelOpen) {
            e.preventDefault();
            useSearchStore.getState().closeActionPanel();
            return;
          }
        }

        // J/K: always redispatch as arrows
        const arrow = VIM_ARROW_MAP[key];
        if (arrow) {
          e.preventDefault();
          redispatchAsArrow(e, arrow);
          return;
        }
      }

      // ── CmdOrCtrl+, → Open settings ───────────────────────
      if (isCmdOrCtrl(e) && e.key === ",") {
        e.preventDefault();
        suppressNextBlurHide();
        openSettings().catch(() => {
          // Settings open is best-effort
        });
        return;
      }

      // ── CmdOrCtrl+N → New session (clear chat + reset backend) ──
      if (isCmdOrCtrl(e) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useChatStore.getState().clearChat();
        void clearBackendChatWithRetry();
        actions.onFocusSearchBar();
        return;
      }

      // ── CmdOrCtrl+1..9 → Open Nth result directly ─────────
      if (isCmdOrCtrl(e) && !e.shiftKey && !e.altKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          actions.onOpenResult(digit - 1);
          return;
        }
      }

      // ── Tab → Toggle mode ─────────────────────────────────
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();

        // Block Tab while model picker is open.
        // Required mode: user must pick a default before leaving agent flow.
        // Session mode: closing the picker first avoids stale UI in search mode.
        const chat = useChatStore.getState();
        if (chat.modelPickerOpen) {
          actions.onFocusSearchBar();
          return;
        }

        // Close action panel first if open
        if (useSearchStore.getState().actionPanelOpen) {
          useSearchStore.getState().closeActionPanel();
        }
        actions.onToggleMode();
        return;
      }

      // ── Escape → Layered cascade ──────────────────────────
      if (e.key === "Escape") {
        e.preventDefault();

        // Layer 0: close Action Panel
        if (useSearchStore.getState().actionPanelOpen) {
          useSearchStore.getState().closeActionPanel();
          actions.onFocusSearchBar();
          return;
        }

        // Layer 0.5: close model-picker action panel
        if (useChatStore.getState().modelPickerActionPanelOpen) {
          useChatStore.getState().closeModelPickerActionPanel();
          actions.onFocusSearchBar();
          return;
        }

        // Layer 0.75: close model picker (unless default is required)
        if (useChatStore.getState().modelPickerOpen) {
          if (useChatStore.getState().modelPickerMode !== "default_required") {
            useChatStore.getState().closeModelPicker();
          }
          actions.onFocusSearchBar();
          return;
        }

        // Layer 0.9: close slash command menu
        if (useChatStore.getState().slashMenuOpen) {
          useChatStore.getState().closeSlashMenu();
          useChatStore.getState().setSlashMenuDismissed(true);
          actions.onFocusSearchBar();
          return;
        }

        // Layer 1: pop command chip (return to main search)
        if (useSearchStore.getState().activeCommand) {
          useSearchStore.getState().deactivateCommand();
          actions.onFocusSearchBar();
          return;
        }

        // Layer 2: clear input text (stay in current mode)
        if (useSearchStore.getState().query.length > 0) {
          useSearchStore.setState({
            query: "",
            results: [],
            selectedIndex: 0,
            isLoading: false,
          });
          actions.onFocusSearchBar();
          return;
        }

        // Layer 3: abort streaming (keep conversation history)
        if (useChatStore.getState().isStreaming) {
          useChatStore.getState().finishResponse();
          abortChat().catch(() => {
            // Abort is best-effort
          });
          actions.onFocusSearchBar();
          return;
        }

        // Layer 4: dismiss window
        hideWindow().catch(() => {
          // Window hide is best-effort
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actions]);
}
