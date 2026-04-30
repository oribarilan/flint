import { useState, useEffect, useCallback, type RefObject } from "react";
import type { AttentionItem } from "../../../main/types";
import type { Suggestion } from "../utils/suggestions";

export type FocusedPanel = "attention" | "suggestions" | null;

interface UseSpatialNavOptions {
  items: AttentionItem[];
  suggestions: Suggestion[];
  hasMessages: boolean;
  isStreaming: boolean;
  disabled?: boolean;
  chatInputRef: RefObject<HTMLInputElement | null>;
  toggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  sendMessage: (prompt: string) => void;
}

interface UseSpatialNavResult {
  focusedPanel: FocusedPanel;
  focusedIndex: number;
  resetFocus: () => void;
}

/**
 * Pick the first available panel, preferring attention.
 * Returns null when neither panel has anything to focus.
 */
function pickInitialPanel(
  itemCount: number,
  hasSuggestions: boolean,
): FocusedPanel {
  if (itemCount > 0) return "attention";
  if (hasSuggestions) return "suggestions";
  return null;
}

/**
 * Recompute the active panel when the current selection is no longer valid.
 * Switches to the panel that still has content; falls through to caller's
 * `panel` value when no switch is needed.
 */
function reconcilePanel(
  panel: Exclude<FocusedPanel, null>,
  itemCount: number,
  hasSuggestions: boolean,
): Exclude<FocusedPanel, null> {
  if (panel === "suggestions" && !hasSuggestions) return "attention";
  if (panel === "attention" && itemCount === 0 && hasSuggestions) return "suggestions";
  return panel;
}

function isTextInputFocused(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/**
 * Owns spatial keyboard navigation between the attention panel and the
 * suggestion cards, plus item activation:
 *
 * - **Ctrl+J / Ctrl+K** — vertical move; first press picks the available panel.
 * - **Ctrl+H** — jump to the attention panel.
 * - **Ctrl+L** — jump to the suggestions panel (only when chat is empty).
 * - **Space** — toggle selection on the focused attention item.
 * - **Enter** — open the focused attention item, or send the focused suggestion.
 *
 * Side effects:
 * - Clears focus on mouse-down and on chat-input focus.
 * - Clamps `focusedIndex` and resets when items shrink to empty.
 * - Scrolls the focused card into view.
 *
 * Space/Enter are ignored while a text input has focus.
 */
export function useSpatialNav({
  items,
  suggestions,
  hasMessages,
  isStreaming,
  disabled = false,
  chatInputRef,
  toggleSelect,
  onOpen,
  sendMessage,
}: UseSpatialNavOptions): UseSpatialNavResult {
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const resetFocus = useCallback(() => {
    setFocusedPanel(null);
    setFocusedIndex(0);
  }, []);

  useFocusClearOnMouse(resetFocus);
  useFocusClearOnInputFocus(chatInputRef, resetFocus);
  useIndexClamp(items, focusedPanel, focusedIndex, setFocusedIndex, resetFocus);
  useScrollFocusedIntoView(focusedPanel, focusedIndex, items);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (disabled) return;
      const hasSuggestions = !hasMessages && !isStreaming;

      if (e.ctrlKey && !e.metaKey) {
        if (e.key === "j" || e.key === "k") {
          e.preventDefault();
          e.stopPropagation();

          if (!focusedPanel) {
            const panel = pickInitialPanel(items.length, hasSuggestions);
            if (!panel) return;
            setFocusedPanel(panel);
            setFocusedIndex(0);
            chatInputRef.current?.blur();
            return;
          }

          const panel = reconcilePanel(focusedPanel, items.length, hasSuggestions);
          if (panel !== focusedPanel) {
            setFocusedPanel(panel);
            setFocusedIndex(0);
          }

          const maxIndex = panel === "attention" ? items.length - 1 : suggestions.length - 1;
          setFocusedIndex((prev) =>
            e.key === "j" ? Math.min(prev + 1, maxIndex) : Math.max(prev - 1, 0),
          );
          chatInputRef.current?.blur();
          return;
        }

        if (e.key === "h") {
          e.preventDefault();
          e.stopPropagation();
          if (items.length > 0) {
            setFocusedPanel("attention");
            setFocusedIndex(0);
            chatInputRef.current?.blur();
          }
          return;
        }

        if (e.key === "l") {
          e.preventDefault();
          e.stopPropagation();
          if (hasSuggestions) {
            setFocusedPanel("suggestions");
            setFocusedIndex(0);
            chatInputRef.current?.blur();
          }
          return;
        }
      }

      if (focusedPanel && (e.key === " " || e.key === "Enter")) {
        if (isTextInputFocused()) return;
        e.preventDefault();
        e.stopPropagation();

        if (focusedPanel === "attention" && focusedIndex < items.length) {
          if (e.key === " ") toggleSelect(items[focusedIndex].id);
          else onOpen(items[focusedIndex].id);
        } else if (
          focusedPanel === "suggestions" &&
          focusedIndex < suggestions.length &&
          e.key === "Enter"
        ) {
          sendMessage(suggestions[focusedIndex].title);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    focusedPanel,
    focusedIndex,
    items,
    suggestions,
    hasMessages,
    isStreaming,
    disabled,
    chatInputRef,
    toggleSelect,
    onOpen,
    sendMessage,
  ]);

  return { focusedPanel, focusedIndex, resetFocus };
}

// ── Side-effect sub-hooks ──

function useFocusClearOnMouse(resetFocus: () => void): void {
  useEffect(() => {
    document.addEventListener("mousedown", resetFocus);
    return () => {
      document.removeEventListener("mousedown", resetFocus);
    };
  }, [resetFocus]);
}

function useFocusClearOnInputFocus(
  chatInputRef: RefObject<HTMLInputElement | null>,
  resetFocus: () => void,
): void {
  useEffect(() => {
    const inputEl = chatInputRef.current;
    if (!inputEl) return;
    inputEl.addEventListener("focus", resetFocus);
    return () => {
      inputEl.removeEventListener("focus", resetFocus);
    };
  }, [chatInputRef, resetFocus]);
}

function useIndexClamp(
  items: AttentionItem[],
  focusedPanel: FocusedPanel,
  focusedIndex: number,
  setFocusedIndex: (n: number) => void,
  resetFocus: () => void,
): void {
  useEffect(() => {
    if (focusedPanel === "attention" && items.length > 0 && focusedIndex >= items.length) {
      setFocusedIndex(Math.max(0, items.length - 1));
    }
    if (focusedPanel === "attention" && items.length === 0) {
      resetFocus();
    }
  }, [items.length, focusedPanel, focusedIndex, setFocusedIndex, resetFocus]);
}

function useScrollFocusedIntoView(
  focusedPanel: FocusedPanel,
  focusedIndex: number,
  items: AttentionItem[],
): void {
  useEffect(() => {
    if (!focusedPanel || focusedIndex < 0) return;
    const selector =
      focusedPanel === "attention"
        ? `[data-testid="attention-card-${items[focusedIndex]?.id}"]`
        : `[data-testid="suggestion-card-${String(focusedIndex)}"]`;
    document.querySelector(selector)?.scrollIntoView({ block: "nearest" });
  }, [focusedPanel, focusedIndex, items]);
}
