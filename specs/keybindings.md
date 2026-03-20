# Keybinding System

## Philosophy

Flint is keyboard-first. Every action is reachable from the keyboard, and keybindings are **discoverable** — the UI shows hints everywhere so users learn naturally.

## Architecture

All keybindings are hardcoded defaults — no config file, no remapping UI. The only exception is the global hotkey (`CmdOrCtrl+Shift+Space`), which is configurable via `config.toml` under `[general] hotkey`.

This keeps the system simple. User-customizable keybindings can be added later if demand warrants it.

### Vim-Style Arrow Keys

`Ctrl+H/J/K/L` are global arrow key aliases (`←↓↑→`). The frontend intercepts these combos and re-dispatches them as the corresponding arrow key events.

- Applies everywhere (search bar, results list, chat input)
- `preventDefault` is always called — this intentionally overrides native macOS text editing shortcuts (`Ctrl+H` = backspace, `Ctrl+J` = newline, `Ctrl+K` = kill-to-end-of-line). Vim arrows take priority.

### Mode-Dependent Actions

Keybindings don't know about modes. Mode-dependent behavior (e.g., `Enter` opens a result in search mode but sends a message in chat mode) is resolved by frontend logic.

### Escape Layering

The `Escape` cascade is hardcoded frontend UX — the layered priority is not configurable.

1. **Close Action Panel** — if the Action Panel is open, close it and return to the results list
2. **Pop command chip** — if a command chip is active, pop it and return to main search
3. **Clear input** — if the search/chat input has text, clear it (stay in current mode)
4. **Abort streaming** — if the AI is streaming a response, abort it (keep conversation history)
5. **Hide window** — dismiss Flint

### Platform-Aware Display

Keybinding hints render differently per platform:

- macOS: `⌘⇧Space`, `⌘,`, `⌘1`, `⌃J`
- Windows/Linux: `Ctrl+Shift+Space`, `Ctrl+,`, `Ctrl+1`, `Ctrl+J`

Use unicode symbols on macOS for a native feel:

| Modifier  | macOS | Windows/Linux |
| --------- | ----- | ------------- |
| CmdOrCtrl | ⌘     | Ctrl          |
| Shift     | ⇧     | Shift         |
| Alt       | ⌥     | Alt           |
| Ctrl      | ⌃     | Ctrl          |

## UI Hints

### `<Kbd>` Component

A reusable component that renders a keybinding as a styled badge:

```tsx
<Kbd keys="CmdOrCtrl+," />
// macOS renders: ⌘ ,
// Windows renders: Ctrl ,
```

Visual style:

- Inline, compact (fits next to labels)
- Slightly rounded rectangle with subtle border
- Muted text color (`--text-secondary`)
- Smaller font (`--font-xs`)
- Monospace feel but using the system font

### Where Hints Appear

Hints are scattered throughout the UI to aid discoverability:

| Location                        | Hint          | Example                          |
| ------------------------------- | ------------- | -------------------------------- |
| Search bar (right side)         | Mode toggle   | `Tab`                            |
| Each search result (right side) | Jump shortcut | `⌘1`, `⌘2`, ...                  |
| Search results footer           | Navigation    | `↑↓ Navigate  ↵ Open  ⎋ Dismiss` |
| Chat input area                 | Send          | `↵ Send`                         |
| Settings (tray tooltip)         | Open          | `⌘,`                             |
| Mode indicator                  | Current mode  | Shows `Tab` to switch            |

Hints are **subtle** — they don't compete with primary content. They use `--text-secondary` or even `--text-placeholder` color and `--font-xs` size.

### Results Footer Bar

A thin footer at the bottom of the results list showing contextual keybindings:

```
Search mode:       ↑↓ Navigate   ↵ Open   ⇧↵ Actions   ⌃J/K Navigate   Tab Chat   ⎋ Dismiss
Action Panel:      ↑↓ Navigate   ↵ Run action   ⎋ Back
Action (armed):    ↵ Confirm delete   ⎋ Cancel
Chat mode:         ↵ Send   ⇧↵ Newline   Tab Search   ⎋ Clear
```

This is always visible when there's content below the search bar, and changes based on mode. When there are no results or the view is loading, the footer still shows with generic hints (e.g., `⎋ Dismiss`).

## Default Keybindings Reference

### Global

| Action        | Key                     | Scope                     | Description                                            |
| ------------- | ----------------------- | ------------------------- | ------------------------------------------------------ |
| Toggle Flint  | `CmdOrCtrl+Shift+Space` | Rust global shortcut      | Show/hide the launcher (configurable in `config.toml`) |
| Open Settings | `CmdOrCtrl+,`           | Frontend (window focused) | Open the settings window                               |

### Launcher

| Action          | Key      | Description                                          |
| --------------- | -------- | ---------------------------------------------------- |
| Toggle mode     | `Tab`    | Switch between search and chat                       |
| Submit          | `Enter`  | Open result (search) or send message (chat)          |
| Clear / Dismiss | `Escape` | Layered: clear input → abort streaming → hide window |

### Navigation (search mode)

| Action            | Key              | Description                                                    |
| ----------------- | ---------------- | -------------------------------------------------------------- |
| Next result       | `↓`              | Move selection down                                            |
| Previous result   | `↑`              | Move selection up                                              |
| Vim arrows        | `Ctrl+H/J/K/L`   | Arrow key aliases (←↓↑→); also push/pop for Action Panel depth |
| Select Nth        | `CmdOrCtrl+1..9` | Open the Nth result directly (no-op if N > result count)       |
| Open Action Panel | `Shift+Enter`    | Show all actions for the selected result                       |

### Action Panel

| Action           | Key                       | Description                                |
| ---------------- | ------------------------- | ------------------------------------------ |
| Open panel       | `Shift+Enter` or `Ctrl+L` | Push into Action Panel for selected result |
| Close panel      | `Escape` or `Ctrl+H`      | Pop back to results list                   |
| Navigate actions | `↑/↓` or `Ctrl+J/K`       | Move action selection                      |
| Execute action   | `Enter`                   | Run the selected action                    |
| Filter actions   | Type                      | Narrow action list by label                |

### Chat mode

| Action       | Key           | Description                        |
| ------------ | ------------- | ---------------------------------- |
| Send message | `Enter`       | Send the current input             |
| Newline      | `Shift+Enter` | Insert a newline in the chat input |

## Implementation Plan

### Frontend

1. `src/hooks/useKeybindings.ts` — centralized global `keydown` listener registered at the App level. Owns all app-level keyboard shortcuts (Tab, Escape, Ctrl+HJKL, CmdOrCtrl+1..9, CmdOrCtrl+,). Component-local `onKeyDown` handlers should only handle input-specific concerns (cursor, IME).
2. `src/components/Kbd.tsx` — reusable keybinding badge component
3. `src/components/HintBar.tsx` — contextual footer showing relevant keybindings (always visible)
4. Scatter `<Kbd>` hints in: search results, search bar, chat panel

### Future

- User-customizable keybindings (separate `keybindings.toml`, settings UI)
- Chords (multi-key sequences like `g g` for go-to-top)
- Conflict detection (warn when two actions share a binding)
