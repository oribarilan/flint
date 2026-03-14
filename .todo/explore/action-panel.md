# Action Panel

## Summary

Add an **Action Panel** to Flint's search result list. Every result carries an ordered list of actions, with the first being the **default action** (fired on Enter). The Action Panel provides access to all actions for the selected result — such as Delete, Pin, Open in Editor, Copy Path, etc.

## Context

The kit system spec (`specs/kits.md`) defines that each result carries an ordered list of actions, with the first being the default. There is currently no UX for accessing actions beyond the first. This is a prerequisite for kits like Clipboard that need Delete, Pin/Unpin, and other per-result operations.

## Status

Design complete — ready for implementation planning.

Visual showcase: `secondary-actions-showcase.html` (root of repo, not committed).

## Terminology

| Concept | Term | Notes |
|---------|------|-------|
| The panel UI | **Action Panel** | Shows all actions for a result |
| Individual operations | **Actions** | Ordered list, not "primary/secondary" |
| The first action | **Default action** | Fires on Enter without opening the panel |
| The search bar indicator | **Actions chip** | Matches "command chip" naming |
| Confirmation state | **Armed state** | Row turns red, awaiting second Enter |
| Depth navigation | **Push / pop** | Ctrl+L pushes in, Ctrl+H pops out |

## Design Decisions

### Visual Model: Full Panel Replace

When the user triggers the Action Panel, the results list is entirely replaced by a vertical action list for the selected result.

- A **header bar** shows which result is being acted on (icon, title, subtitle).
- An **Actions chip** appears in the search bar — same pattern as command-mode chips.
- The search bar placeholder becomes **"Filter actions…"** — typing narrows the action list.
- Actions are rendered as a vertical list with icon, label, and optional shortcut hint.
- Destructive actions (e.g., Delete) are visually separated by a divider and colored red.
- The Action Panel **always opens**, even if the result has only one action — consistency over cleverness.

### Trigger Keys

Two paths to the same action — discoverable and power-user:

| Key | Audience | Notes |
|-----|----------|-------|
| `Shift+Enter` | General users | Obvious modifier on the default action key |
| `Ctrl+L` | Vim users | Consistent with existing `Ctrl+H/J/K/L` navigation — "push" into panel |

### Navigation Model

The `Ctrl+H/L` pair is a general **push/pop** depth mechanism:

- `Ctrl+L` — push into a child panel (results → Action Panel, or action → armed state)
- `Ctrl+H` — pop back out to the parent panel

Within any panel:

- `↑/↓` or `Ctrl+J/K` — move selection
- `Enter` — execute the selected action
- `Escape` — pop back (same as `Ctrl+H`)

### Escape Layering

The Action Panel is a new first layer in the existing Escape cascade:

1. **Action Panel open** → close it, return to results list
2. Input has text → clear the input field
3. Chat session active → clear chat, return to search mode
4. Empty search mode → dismiss (hide) the window

### Action Filtering

Always available — even for short action lists. Typing in the search bar filters the action list by label. Natural to the app, consistent with command search.

### No Global Action Shortcuts

Simplified model: `Enter` fires the default action. Everything else goes through the Action Panel. No per-action modifier shortcuts (e.g., `⌘⌫` for Delete) outside the panel. Kits cannot declare global shortcuts for individual actions — only a hotkey to enter the kit's command mode.

### Confirmation: Press-to-Arm, Press-to-Fire

Actions that declare `requires_confirmation: true` use a two-press confirmation:

1. First `Enter` **arms** the action — the row enters the **armed state** (red background, label changes to "Press Enter again to delete").
2. Second `Enter` **confirms** and executes.
3. `Escape` or navigating away **cancels** and disarms.
4. **Auto-disarm timeout** (~3 seconds) — if the user doesn't confirm, the row reverts to its normal state.

No dialogs, no buttons — just a visual state change on the row itself. Keyboard-native and minimal.

## Core Result Actions

### Files (text/code)

| # | Action | Description |
|---|--------|-------------|
| 1 | **Open** (default) | Launch with default OS app |
| 2 | Open in Editor | Open in configured editor (from settings) |
| 3 | Reveal in File Manager | Show in enclosing folder |
| 4 | Copy Path | Absolute path to clipboard |
| 5 | Copy Name | Filename only to clipboard |
| 6 | Delete | Move to trash (with confirmation — armed state) |

"Open in Editor" only appears for text/code files, detected by extension or MIME type.

### Files (binary/media)

| # | Action | Description |
|---|--------|-------------|
| 1 | **Open** (default) | Launch with default OS app |
| 2 | Reveal in File Manager | Show in enclosing folder |
| 3 | Copy Path | Absolute path to clipboard |
| 4 | Copy Name | Filename only to clipboard |
| 5 | Delete | Move to trash (with confirmation — armed state) |

### Directories

| # | Action | Description |
|---|--------|-------------|
| 1 | **Open in File Manager** (default) | Open the folder |
| 2 | Open in Terminal | Launch configured terminal at this path |
| 3 | Copy Path | Absolute path to clipboard |
| 4 | Copy Name | Folder name only to clipboard |
| 5 | Delete | Move to trash (with confirmation — armed state) |

### Applications

| # | Action | Description |
|---|--------|-------------|
| 1 | **Launch** (default) | Open the application |
| 2 | Reveal in File Manager | Show the .app / .exe / binary |

### Platform-Adaptive Labels

Action labels adapt per platform:

| Generic | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Reveal in File Manager | Reveal in Finder | Show in Explorer | Open in File Manager |
| Delete (tooltip/internal) | Move to Trash | Move to Recycle Bin | Move to Trash |

## Settings Additions

Two new fields in the **General** settings category:

### Default Terminal

- Auto-detected from `$TERM_PROGRAM` (macOS) / `$TERMINAL` (Linux) environment variables.
- Visual override in settings: dropdown with common options (Terminal.app, iTerm, Warp, Alacritty, kitty, WezTerm, Windows Terminal, GNOME Terminal, custom…).
- Stored as the launch command in `config.toml` under `[general]`.

### Default Editor

- Auto-detected from `$VISUAL` / `$EDITOR` environment variables.
- Visual override in settings: dropdown with common options (VS Code, Cursor, Zed, Neovim, Vim, Emacs, Sublime Text, custom…).
- The value is the launch command (e.g., `code`, `nvim`, `zed`).
- Stored in `config.toml` under `[general]`.

```toml
[general]
hotkey = "CmdOrCtrl+Shift+Space"
launch_at_login = false
terminal = "auto"    # "auto" = detect from env, or explicit command
editor = "auto"      # "auto" = detect from env, or explicit command
```

## Implementation Notes

- First deliverable: write the formal spec at `specs/action-panel.md`, derived from the design decisions in this document.
- The spec is the source of truth for implementation; this `.todo` file is the design exploration record.

## Dependencies

None — this is a foundational feature.

## Dependents

- Clipboard Management kit (`.todo/explore/clipboard-management.md`)
- Any future kit that exposes per-result secondary actions
