import { useEffect, type RefObject } from "react";

interface UseGlobalShortcutsOptions {
  chatInputRef: RefObject<HTMLInputElement | null>;
  /** Whether the model picker is currently open. */
  isPickerOpen: boolean;
  /** Whether the settings pane is currently open. */
  showSettings: boolean;
  /** Toggle the settings pane (Cmd/Ctrl+,). */
  toggleSettings: () => void;
  /** Close the model picker (Esc when picker open). */
  closePicker: () => void;
  /** Close the settings pane (Esc when settings open). */
  closeSettings: () => void;
  /** Reset spatial-nav focus state (Esc when nothing else to close). */
  resetFocus: () => void;
  /** Reset the chat session in the main process. */
  onResetChat: () => Promise<void> | void;
  /** Clear chat messages in the renderer. */
  onClearMessages: () => void;
  /** Clear attention-store selection. */
  onClearSelection: () => void;
  /** Hide the overlay window (Esc when nothing else to close). */
  onHideOverlay: () => void;
}

/**
 * Owns app-wide keyboard shortcuts that are not spatial navigation:
 *
 * - **Cmd/Ctrl+,** — toggle Settings.
 * - **Cmd+N** — new chat (resets backend session, clears messages and selection,
 *   focuses chat input).
 * - **Esc** — priority order: close picker → close settings → reset focus + hide overlay.
 * - **Slash (`/`)** — focus the chat input when no text input has focus.
 *
 * No internal state. Pure event wiring around injected handlers.
 */
export function useGlobalShortcuts({
  chatInputRef,
  isPickerOpen,
  showSettings,
  toggleSettings,
  closePicker,
  closeSettings,
  resetFocus,
  onResetChat,
  onClearMessages,
  onClearSelection,
  onHideOverlay,
}: UseGlobalShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        void onResetChat();
        onClearMessages();
        onClearSelection();
        chatInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (isPickerOpen) {
          closePicker();
        } else if (showSettings) {
          closeSettings();
        } else if (
          document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body
        ) {
          // Something inside the pill is focused (e.g. chat input) — blur it first
          document.activeElement.blur();
        } else {
          resetFocus();
          onHideOverlay();
        }
        return;
      }

      if (e.key === "/") {
        const el = document.activeElement;
        const isText =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable);
        if (!isText) {
          e.preventDefault();
          chatInputRef.current?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    chatInputRef,
    isPickerOpen,
    showSettings,
    toggleSettings,
    closePicker,
    closeSettings,
    resetFocus,
    onResetChat,
    onClearMessages,
    onClearSelection,
    onHideOverlay,
  ]);
}
