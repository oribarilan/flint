# Flint UX Spec

## Table of Contents
- [Modes](#modes)
- [Search Mode](#search-mode)
- [Chat Mode](#chat-mode)
- [Escape Key Layering](#escape-key-layering)
- [Settings](#settings)
- [Future (deferred)](#future-deferred)

## Modes

Flint has two modes, toggled with **Tab**:

| Mode | Purpose | Submit |
|------|---------|--------|
| **Search** (default) | Fuzzy file/app search | Enter opens selected result |
| **Chat** | Quick AI conversation | Enter sends message |

### Mode Switching

- **Tab** toggles between search and chat mode at any time.
- The current mode is visually indicated by:
  - **Icon swap** in the search bar (magnifying glass ↔ sparkle/chat icon).
  - **Subtle background color change** on the search bar.
- No prefixes, no slash commands — mode is explicit and always visible.

## Search Mode

Standard launcher behavior:
- Type → fuzzy match against indexed files and apps → arrow keys to navigate → Enter to open.
- Results appear instantly (sub-10ms target per keystroke).
- Escape clears query or dismisses window (see Escape layering below).

## Chat Mode

A lightweight, ephemeral AI conversation inside the launcher overlay:
- Type a message → Enter sends it → streamed response appears below.
- Multi-turn: follow-up messages continue the same chat session.
- The LLM may respond with text answers, action suggestions, or anything natural to the query.
- No distinction between "commands" and "questions" — the LLM handles both in a single conversational flow.

### Chat Session Lifecycle

- A chat session **persists across window hide/show** (hotkey dismiss + re-open preserves it).
- A chat session is **cleared by Escape** (see layering below) — there is no disk persistence.
- When cleared, the user returns to a clean search bar.

## Escape Key Layering

Escape behavior is contextual, processed in this order:

1. **Input has text** → clear the input field.
2. **Chat session active** (messages exist) → clear the chat session, return to search mode.
3. **Empty search mode** → dismiss (hide) the window.

Each press handles exactly one layer.

## Settings

A separate, persistent window opened from the tray menu ("Settings...") or via a Tauri command. Same visual language as the launcher — dark theme, glassmorphism, system font — but in a standard windowed layout with sidebar navigation.

### Structure

Sidebar on the left lists setting categories. Content area on the right shows the active category. Adding a new category = adding one sidebar entry + one content panel.

#### Categories

| Category | Description | Initial Settings |
|----------|-------------|------------------|
| **General** | App behavior & system integration | Launch at login, global hotkey configuration |
| **Chat** | AI provider connections & model preferences | Provider auth (GitHub Copilot), default model, future: additional providers |
| **Search** | File indexing scope & filtering | Indexed directories, exclude patterns, max depth |

#### Design Principles

- **Expandable by default.** Each category is a self-contained panel. New settings are added to existing categories, or a new category is added to the sidebar — no layout refactoring needed.
- **Consistent with Flint.** Dark translucent palette, same CSS variables, rounded corners, subtle borders. Settings should feel like part of the app, not a system dialog.
- **Minimal for now.** Only surface settings that are immediately useful. Don't add toggles for things that have no alternative yet.
- **Config file as source of truth.** Settings are stored as a human-readable TOML file at `~/.config/flint/config.toml`. The Settings UI is a visual editor for this file — not a separate store. Power users can edit the file directly (or symlink it into a dotfiles repo), and changes are reflected immediately in both directions.

#### Config File

Location: `~/.config/flint/config.toml` (follows XDG on Linux/macOS, `%APPDATA%\flint\config.toml` on Windows).

```toml
[general]
hotkey = "CmdOrCtrl+Shift+Space"
launch_at_login = false

[search]
directories = ["~/Desktop", "~/Documents", "~/Downloads", "/Applications"]
exclude = ["node_modules", ".git", "target", "__pycache__"]
max_depth = 6

[chat]
default_model = "gpt-4.1"
```

- **Rust owns the file**: reads on startup, watches for external changes (via `notify` crate), and exposes `get_config` / `update_config` IPC commands.
- **Defaults are implicit**: missing keys fall back to compile-time defaults. The file only needs to contain overrides.
- **Settings UI writes via IPC**: the frontend never touches the filesystem directly.

#### Layout

```
┌──────────────────────────────────────────┐
│  Flint Settings                          │
├────────────┬─────────────────────────────┤
│            │                             │
│  General   │  [Active category content]  │
│  Chat      │                             │
│  Search    │                             │
│            │                             │
│            │                             │
├────────────┴─────────────────────────────┤
│  v0.1.0                                  │
└──────────────────────────────────────────┘
```

#### Chat Settings Detail

- **Provider section**: Shows connected providers with status (Connected / Not connected), sign in / sign out buttons. Currently only GitHub Copilot.
- **Model selection**: Dropdown to choose the default model (e.g., gpt-4.1, claude-sonnet-4). Populated from the provider's known model list.
- Future: additional provider cards (OpenAI API key, Anthropic, etc.) appear as new rows in the same section.

#### General Settings Detail

- **Launch at login**: Toggle (on/off). Uses platform autostart APIs.
- **Global hotkey**: Editable shortcut field. Default: `Cmd+Shift+Space`.
- Future: theme, notification preferences, etc.

#### Search Settings Detail

- **Indexed directories**: List with add/remove. Default: `~/Desktop`, `~/Documents`, `~/Downloads`, `/Applications`.
- **Exclude patterns**: Editable list. Default: `node_modules`, `.git`, `target`, etc.
- Future: max depth, re-index button, index stats.

## Future (deferred)

- **Full chat experience**: A separate, persistent window (like the Settings window) with conversation history, markdown rendering, code blocks, and copy buttons. Opened from tray menu or a "Continue in full chat →" link. Lowest priority.
- **AI commands with confirmation UI**: Action cards with "Run" button for destructive or system-level operations. Can evolve naturally from the chat flow when tool-calling is added.
- **Intent auto-detection**: Potentially auto-switch to chat mode when the query looks like a question or command (heuristic or LLM-based). For now, Tab toggle is sufficient.
