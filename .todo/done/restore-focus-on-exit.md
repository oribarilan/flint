# Restore Focus to Previous App on Exit

## Summary

When the user has app A in focus, opens Flint, performs an action, and then exits Flint, app A should regain focus. Currently it does not — the user is left with no app in focus.

## Context

Flint is an overlay launcher activated via global hotkey. The typical flow is: user is working in another app → triggers Flint → searches or chats → dismisses Flint → expects to return to their previous app seamlessly.

## Requirements

- Before showing the Flint window, capture a reference to the currently focused/frontmost application
- When Flint hides or closes, restore focus to that previously captured app
- Handle edge cases: previous app was closed while Flint was open, multiple displays, etc.

## Technical Notes

- **macOS**: Use `NSWorkspace` to get the frontmost application before activation, then `activate()` it on hide
- **Windows**: Use `GetForegroundWindow` / `SetForegroundWindow` Win32 APIs
- **Linux**: Use `xdotool` or equivalent X11/Wayland mechanism
- This is inherently platform-specific — isolate into `mod platform` with `#[cfg]` attributes
- Tauri's window hide/close events can trigger the restore logic
