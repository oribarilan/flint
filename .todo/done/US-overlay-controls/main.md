# US-overlay-controls

## Goal

Make the overlay panel feel more controllable and transparent: ESC dismisses it, the bottom bar shows which model Copilot is using, and the user can switch models from a compact picker.

## Definition of Done

- [ ] Pressing ESC while the overlay is visible hides it (unless a popover/modal is open, in which case ESC closes that first)
- [ ] The bottom bar displays the current Copilot model name
- [ ] Clicking the model name opens a picker listing all available models; selecting one switches the model and persists the choice
- [ ] All three features have unit tests
- [ ] `just check` passes

## Task Priority

1. `esc-to-close.md` — Independent, no IPC changes. Quick win.
2. `model-display.md` — Builds IPC foundation (channels, preload, config, store) that the picker depends on.
3. `model-picker.md` — Depends on model-display infrastructure.

## Cross-Cutting Concerns

- **Escape stack pattern**: App.tsx owns a single `keydown` listener that closes the topmost layer (picker → settings → overlay). The existing ESC handler in Settings.tsx is removed and unified here.
- **IPC additions**: Three new channels (`model:list`, `model:set`, `model:changed`) added to `IPC_CHANNELS`, exposed via `window.flint`, with typed preload bridge.
- **Config change**: `FlintConfig` gains a `model: string` field (default `"gpt-4.1"`). Persisted via electron-store.
- **modelStore**: New lightweight Zustand store — `{ currentModel: string, models: { id: string, name: string }[] }`. Models fetched lazily on first picker open, cached.
- **SDK APIs used**: `client.listModels()` → `ModelInfo[]` (cached by SDK). `session.setModel(id)` → switch without session recreation.
- **Disabled models**: Filter out models with `policy: "disabled"` from the picker list.
- **Error handling**: If `session.setModel()` fails, log the error, don't update config or renderer. Silent failure — no user-facing error.
- **Design tokens only**: No hardcoded colors. Model name in `--font-mono`, `--font-xs`. All interactive states per design spec.
