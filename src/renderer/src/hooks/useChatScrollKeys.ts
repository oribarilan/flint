import { useEffect, type RefObject } from "react";

interface UseChatScrollKeysOptions {
  chatPanelRef: RefObject<HTMLDivElement | null>;
  hasMessages: boolean;
  disabled?: boolean;
}

/**
 * Owns the Ctrl+U / Ctrl+D chat scrolling shortcuts.
 *
 * - Ctrl+D scrolls down by half the panel's clientHeight.
 * - Ctrl+U scrolls up by half the panel's clientHeight.
 * - Respects `prefers-reduced-motion` (instant vs smooth).
 * - No-op when chat is empty or `disabled`.
 */
export function useChatScrollKeys({
  chatPanelRef,
  hasMessages,
  disabled = false,
}: UseChatScrollKeysOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (disabled) return;
      if (!e.ctrlKey || e.metaKey) return;
      if (e.key !== "d" && e.key !== "u") return;

      e.preventDefault();
      e.stopPropagation();

      if (!hasMessages || !chatPanelRef.current) return;

      const half = chatPanelRef.current.clientHeight / 2;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      chatPanelRef.current.scrollBy({
        top: e.key === "d" ? half : -half,
        behavior: reducedMotion ? "instant" : "smooth",
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [chatPanelRef, hasMessages, disabled]);
}
