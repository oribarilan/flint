# US-keyboard-nav

## Goal

Make Flint fully keyboard-navigable with vim-style spatial navigation (`Ctrl+h/j/k/l`), a `/` shortcut to focus chat, and a reusable `HotkeyHint` component that renders shortcut hints throughout the app.

## Definition of Done

- [x] `/` focuses the chat input from anywhere (when not already in a text input)
- [x] `Ctrl+j/k` navigates items in the active panel (attention items or suggestion cards)
- [x] `Ctrl+h/l` switches focus between left (attention) and right (suggestions) panels when both have items. No-op when either target panel is empty.
- [x] When chat has messages (no suggestions), `Ctrl+j/k` navigates attention items directly, `Ctrl+h/l` is a no-op
- [x] `Ctrl+u/d` scrolls the chat panel up/down by half a viewport
- [x] `Space` toggles selection on a focused attention item, `Enter` opens it
- [x] `Enter` on a focused suggestion card sends it as a chat prompt
- [x] `HotkeyHint` component renders styled key caps with word-label modifiers (Ctrl, Cmd, Shift, Alt — changed from symbols per user direction)
- [x] Bottom bar shows navigation hints (`Ctrl+H/J/K/L navigate · Ctrl+U/D scroll · ↵ open · Space select` — updated per user direction; removed `/` chat hint which appears as styled `<kbd>` in chat input instead)
- [x] Chat input shows a styled `<kbd>` element as the `/` hint (changed from placeholder text)
- [x] All features have unit tests
- [x] `just check` passes

## Task Priority

1. `hotkey-hint.md` — Reusable component, no dependencies. Used by all subsequent tasks.
2. `slash-to-focus.md` — Independent, quick win. Only needs the chat input ref.
3. `spatial-nav.md` — Core navigation system. Depends on nothing but is the largest task.
4. `bottom-bar-hints.md` — Depends on hotkey-hint. Wires hints into the bottom bar.

## Cross-Cutting Concerns

- **Keyboard handler location**: All new shortcut handlers live in App.tsx's existing `keydown` useEffect, extending the escape stack pattern. Order: Escape stack → Ctrl+h/j/k/l → `/` → pass through.
- **Focus state**: App.tsx owns `focusedPanel` (`'attention' | 'suggestions' | null`) and `focusedIndex` (number). These are view-local state (no Zustand store needed).
- **Visual focus indicator**: Focused items get a `.keyboardFocused` class (distinct from hover). Uses `--bg-hover` background, no transition (keyboard-driven state rule). The existing `.focused` class in Picker can be referenced as the pattern.
- **Input guard for `/`**: Check `document.activeElement` — if it's an `input`, `textarea`, or `[contenteditable]`, ignore the keypress so users can type literal `/` in chat.
- **Ctrl vs Cmd**: Use `Ctrl` for all navigation shortcuts (not `Cmd`). This avoids collision with macOS system shortcuts (`Cmd+H` = hide app, `Cmd+L` = address bar) and matches vim convention.
- **Design tokens only**: HotkeyHint styling uses `--bg-secondary`, `--border-subtle`, `--radius-sm`, `--font-xs`, `--font-mono`, `--text-placeholder`.
- **Modifier labels**: `ctrl` → `Ctrl`, `cmd`/`meta` → `Cmd`, `shift` → `Shift`, `alt`/`option` → `Alt` (word labels, not symbols — changed per user direction). Special keys: `enter` → `↵`, `space` → `␣`, `escape` → `esc`.
