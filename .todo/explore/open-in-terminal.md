# Open in Terminal Action

## Summary

Add an "Open in Terminal" action for directory results in the Action Panel. When selected, it opens the user's configured terminal emulator at that directory path.

## Context

This was originally part of the Action Panel feature but removed because the macOS `open -a` approach didn't reliably open a new terminal window at the correct directory. The `$TERM_PROGRAM` → app name mapping is fragile across terminal emulators.

## Approach Options

1. **AppleScript for Terminal.app / iTerm2** — Use `osascript` to tell the terminal to open a new window with `cd <path>`. Reliable but requires per-terminal scripts.
2. **Shell wrapper** — Spawn a shell (`zsh -c "cd <dir> && exec $SHELL"`) inside the terminal. Needs the terminal to accept a command arg.
3. **Platform-specific helpers** — macOS: `open -a <app> <dir>` (needs correct app name mapping). Linux: most terminals accept a `--working-directory` flag. Windows: `wt.exe -d <dir>`.

## Config

The `[general] terminal` setting already exists with `"auto"` default. The detection logic (from `$TERM_PROGRAM` on macOS, `$TERMINAL` on Linux) is in place. The command and config plumbing are ready — only the launch mechanism needs to be reliable.

## Status

Pending — needs investigation into which approach works across common macOS terminals (Terminal.app, iTerm2, Warp, Alacritty, kitty, WezTerm).

## Dependencies

- Action Panel (implemented)
