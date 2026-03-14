import { useEffect } from "react";
import { useSearchStore } from "../stores/searchStore";
import { useChatStore } from "../stores/chatStore";
import { hideWindow, openSettings } from "../lib/commands";
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

        // Layer 3: clear chat (stay in current mode)
        if (useChatStore.getState().messages.length > 0) {
          useChatStore.getState().clearChat();
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
