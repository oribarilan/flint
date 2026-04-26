import { useState, useEffect, useCallback, type RefObject } from "react";
import type { AttentionItem } from "../../../main/types";
import type { Suggestion } from "../utils/suggestions";

export type FocusedPanel = "attention" | "suggestions" | null;

interface UseKeyboardNavOptions {
  items: AttentionItem[];
  suggestions: Suggestion[];
  hasMessages: boolean;
  isStreaming: boolean;
  disabled?: boolean;
  chatPanelRef: RefObject<HTMLDivElement | null>;
  chatInputRef: RefObject<HTMLInputElement | null>;
  toggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  sendMessage: (prompt: string) => void;
}

interface UseKeyboardNavResult {
  focusedPanel: FocusedPanel;
  focusedIndex: number;
  resetFocus: () => void;
}

export function useKeyboardNav({
  items,
  suggestions,
  hasMessages,
  isStreaming,
  disabled = false,
  chatPanelRef,
  chatInputRef,
  toggleSelect,
  onOpen,
  sendMessage,
}: UseKeyboardNavOptions): UseKeyboardNavResult {
  const [focusedPanel, setFocusedPanel] = useState<FocusedPanel>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const resetFocus = useCallback(() => {
    setFocusedPanel(null);
    setFocusedIndex(0);
  }, []);

  // Clear focus on mouse click
  useEffect(() => {
    const clearFocus = () => {
      resetFocus();
    };
    document.addEventListener("mousedown", clearFocus);
    return () => {
      document.removeEventListener("mousedown", clearFocus);
    };
  }, [resetFocus]);

  // Clear focus when chat input gains focus
  useEffect(() => {
    const inputEl = chatInputRef.current;
    if (!inputEl) return;
    const clearFocus = () => {
      resetFocus();
    };
    inputEl.addEventListener("focus", clearFocus);
    return () => {
      inputEl.removeEventListener("focus", clearFocus);
    };
  }, [chatInputRef, resetFocus]);

  // Clamp focusedIndex when items change
  useEffect(() => {
    if (focusedPanel === "attention" && items.length > 0 && focusedIndex >= items.length) {
      setFocusedIndex(Math.max(0, items.length - 1));
    }
    if (focusedPanel === "attention" && items.length === 0) {
      resetFocus();
    }
  }, [items.length, focusedPanel, focusedIndex, resetFocus]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedPanel && focusedIndex >= 0) {
      const selector =
        focusedPanel === "attention"
          ? `[data-testid="attention-card-${items[focusedIndex]?.id}"]`
          : `[data-testid="suggestion-card-${String(focusedIndex)}"]`;
      document.querySelector(selector)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedPanel, focusedIndex, items]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (disabled) return;

      const hasSuggestions = !hasMessages && !isStreaming;

      // Ctrl+h/j/k/l — spatial navigation
      if (e.ctrlKey && !e.metaKey) {
        if (e.key === "j" || e.key === "k") {
          e.preventDefault();
          e.stopPropagation();

          let panel = focusedPanel;
          if (!panel) {
            // First press: pick the available panel (prefer attention, fall back to suggestions)
            if (items.length > 0) {
              panel = "attention";
            } else if (hasSuggestions) {
              panel = "suggestions";
            } else {
              return;
            }
            setFocusedPanel(panel);
            setFocusedIndex(0);
            chatInputRef.current?.blur();
            return;
          }

          // When current panel isn't available, switch to the one that is
          if (!hasSuggestions && panel === "suggestions") {
            panel = "attention";
            setFocusedPanel("attention");
            setFocusedIndex(0);
          } else if (panel === "attention" && items.length === 0 && hasSuggestions) {
            panel = "suggestions";
            setFocusedPanel("suggestions");
            setFocusedIndex(0);
          }

          const maxIndex = panel === "attention" ? items.length - 1 : suggestions.length - 1;

          if (e.key === "j") {
            setFocusedIndex((prev) => Math.min(prev + 1, maxIndex));
          } else {
            setFocusedIndex((prev) => Math.max(prev - 1, 0));
          }
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

        // Ctrl+u/d — chat scrolling
        if (e.key === "d" || e.key === "u") {
          e.preventDefault();
          e.stopPropagation();
          if (hasMessages && chatPanelRef.current) {
            const half = chatPanelRef.current.clientHeight / 2;
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            chatPanelRef.current.scrollBy({
              top: e.key === "d" ? half : -half,
              behavior: reducedMotion ? "instant" : "smooth",
            });
          }
          return;
        }
      }

      // Space/Enter actions — only when focusedPanel is active
      if (focusedPanel && (e.key === " " || e.key === "Enter")) {
        const el = document.activeElement;
        const isText =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable);
        if (isText) return;

        e.preventDefault();
        e.stopPropagation();

        if (focusedPanel === "attention" && focusedIndex < items.length) {
          if (e.key === " ") {
            toggleSelect(items[focusedIndex].id);
          } else {
            onOpen(items[focusedIndex].id);
          }
        } else if (focusedPanel === "suggestions" && focusedIndex < suggestions.length) {
          if (e.key === "Enter") {
            sendMessage(suggestions[focusedIndex].title);
          }
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
    chatPanelRef,
    toggleSelect,
    onOpen,
    sendMessage,
  ]);

  return { focusedPanel, focusedIndex, resetFocus };
}
