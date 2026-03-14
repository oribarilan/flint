# Action Panel

The Action Panel surfaces all available actions for a selected search result. Every result carries an ordered list of actions — the first is the **default action** (fired on Enter). The Action Panel shows the full list, triggered by an explicit key combo.

This is a foundational feature: it enables kits like Clipboard (Delete, Pin/Unpin) and enriches core file results (Reveal in Finder, Copy Path, Open in Editor) without polluting the primary search flow.

## Table of Contents

- [Terminology](#terminology)
- [Trigger Keys](#trigger-keys)
- [Visual Model](#visual-model)
- [Navigation](#navigation)
- [Escape Layering](#escape-layering)
- [Action Filtering](#action-filtering)
- [Confirmation: Armed State](#confirmation-armed-state)
- [Core Result Actions](#core-result-actions)
- [Platform-Adaptive Labels](#platform-adaptive-labels)
- [Action Data Model](#action-data-model)
- [Settings](#settings)
- [Future (deferred)](#future-deferred)

## Terminology

| Concept | Term | Notes |
|---------|------|-------|
| The panel UI | **Action Panel** | Shows all actions for a result |
| Individual operations | **Actions** | Ordered list; not "primary/secondary" |
| The first action | **Default action** | Fires on Enter without opening the panel |
| The search bar indicator | **Actions chip** | Matches "command chip" naming pattern |
| Confirmation state | **Armed state** | Row turns red, awaiting second Enter |
| Depth navigation | **Push / pop** | Ctrl+L pushes in, Ctrl+H pops out |

## Trigger Keys

Two paths to the same action — discoverable and power-user:

| Key | Audience | Notes |
|-----|----------|-------|
| `Shift+Enter` | General users | Obvious modifier on the default action key |
| `Ctrl+L` | Vim users | Consistent with `Ctrl+H/J/K/L` — "push" into panel |

Both keys open the Action Panel for the currently selected result. If no result is selected, they are no-ops.

The Action Panel **always opens**, even if the result has only one action — consistency over cleverness.

## Visual Model

Full panel replace — the results list is entirely replaced by the action list.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  🔍  [Actions ✦]  Filter actions…                      Tab  │  ← Actions chip in search bar
├──────────────────────────────────────────────────────────────┤
│  [icon]  hello.ts                                            │  ← Header: result being acted on
│          ~/repos/flint/src/hello.ts                          │
├──────────────────────────────────────────────────────────────┤
│  ▸ Open                                                  ⏎   │  ← Selected action
│    Open in Editor                                            │
│    Reveal in Finder                                          │
│    Copy Path                                                 │
│    Copy Name                                                 │
│  ──────────────────────────────────────────────────────────  │  ← Divider before destructive
│    Delete                                                    │
├──────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   ⏎ Run action   Esc Back                      │  ← Hint bar
└──────────────────────────────────────────────────────────────┘
```

### Components

1. **Actions chip** — appears in the search bar when the panel is open. Same visual style as the command chip (accent background, accent text, small font, rounded). Includes a small icon and the label "Actions".

2. **Header bar** — shows the result being acted on. Displays the result's icon, title, and subtitle. Visually distinct from action items (darker background, smaller text). Communicates "you are acting on this result."

3. **Action list** — vertical list of all actions for the result. Each item has:
   - Icon (18×18, left-aligned)
   - Label (primary text)
   - Optional keyboard shortcut hint (right-aligned, `<Kbd>` style)

4. **Divider** — a thin horizontal line before destructive actions. Provides visual separation and a pause before danger.

5. **Hint bar** — contextual footer showing navigation keys. Replaces the normal search hints when the panel is open.

### Selection

The first action is selected by default when the panel opens. Selection follows the same visual treatment as result selection (accent-subtle background).

## Navigation

The `Ctrl+H/L` pair is a general **push/pop** depth mechanism throughout Flint:

| Key | Action |
|-----|--------|
| `Ctrl+L` or `Shift+Enter` | Push: open Action Panel for selected result |
| `Ctrl+H` or `Escape` | Pop: close Action Panel, return to results |
| `↑/↓` or `Ctrl+J/K` | Move selection within the panel |
| `Enter` | Execute the selected action |

This is the same navigation model as the results list — no new patterns to learn.

### Focus

When the Action Panel opens, keyboard focus remains in the search bar (consistent with the results list). The search bar input is cleared and repurposed for action filtering.

When the Action Panel closes, the original query is restored and the previously selected result remains selected.

## Escape Layering

The Action Panel inserts a new first layer in the Escape cascade:

1. **Action Panel open** → close it, return to results list *(new)*
2. **Command chip active** → pop the chip, return to main search
3. **Input has text** → clear the input field
4. **Chat session active** → clear the chat, return to search mode
5. **Empty search mode** → dismiss (hide) the window

Each press handles exactly one layer.

## Action Filtering

When the Action Panel is open, typing in the search bar filters the action list by label. This is always available, even for short action lists.

- Filtering is case-insensitive substring match on the action label.
- If the filter matches no actions, show "No matching actions" empty state.
- Clearing the filter (backspace to empty) restores the full action list.
- The filter query is independent of the search query — the original search query is preserved and restored when the panel closes.

## Confirmation: Armed State

Destructive actions (e.g., Delete) require a two-press confirmation.

### Flow

1. User selects a destructive action and presses `Enter`.
2. The action row enters the **armed state**: red background, icon turns red, label changes to "Press Enter again to delete".
3. User presses `Enter` again → action executes.
4. User presses `Escape`, navigates away, or waits ~3 seconds → action **disarms** (row reverts to normal).

### Rules

- Only actions that declare `requires_confirmation: true` use this flow.
- At most one action can be armed at a time.
- Navigating to a different action (`↑/↓`) disarms the current one.
- The armed state is purely visual — no extra UI elements, dialogs, or buttons.
- The hint bar updates during armed state to show "⏎ Confirm delete  Esc Cancel".

## Core Result Actions

### Files (text/code)

| # | Action | Type | Confirm |
|---|--------|------|---------|
| 1 | **Open** | `Open` | No |
| 2 | Open in Editor | `OpenInEditor` | No |
| 3 | Reveal in File Manager | `RevealInFileManager` | No |
| 4 | Copy Path | `CopyPath` | No |
| 5 | Copy Name | `CopyName` | No |
| 6 | Delete | `Delete` | **Yes** |

"Open in Editor" appears only for text/code files, detected by file extension. Binary/media files omit it.

### Files (binary/media)

| # | Action | Type | Confirm |
|---|--------|------|---------|
| 1 | **Open** | `Open` | No |
| 2 | Reveal in File Manager | `RevealInFileManager` | No |
| 3 | Copy Path | `CopyPath` | No |
| 4 | Copy Name | `CopyName` | No |
| 5 | Delete | `Delete` | **Yes** |

### Directories

| # | Action | Type | Confirm |
|---|--------|------|---------|
| 1 | **Open in File Manager** | `Open` | No |
| 2 | Open in Terminal | `OpenInTerminal` | No |
| 3 | Copy Path | `CopyPath` | No |
| 4 | Copy Name | `CopyName` | No |
| 5 | Delete | `Delete` | **Yes** |

### Applications

| # | Action | Type | Confirm |
|---|--------|------|---------|
| 1 | **Launch** | `Open` | No |
| 2 | Reveal in File Manager | `RevealInFileManager` | No |

## Platform-Adaptive Labels

Action labels adapt per platform at compile time:

| Generic | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Reveal in File Manager | Reveal in Finder | Show in Explorer | Open in File Manager |
| Open in File Manager | Open in Finder | Open in Explorer | Open in File Manager |
| Delete (armed label) | Move to Trash | Move to Recycle Bin | Move to Trash |

Labels are set on the Rust side and serialized to the frontend. The frontend does not need platform detection for action labels.

## Action Data Model

### Rust (`KitAction` extensions)

New variants added to the `KitAction` enum:

```rust
pub enum KitAction {
    // Existing
    Copy { text: String, label: Option<String> },
    Open { target: String },
    FocusWindow { window_id: u64 },
    OpenApp,
    Paste { text: String },
    ActivateCommand { kit_id: String, command_id: String },
    Custom { id: String, label: String },

    // New
    RevealInFileManager { target: String },
    CopyPath { path: String },
    CopyName { name: String },
    Delete { target: String },
    OpenInEditor { target: String },
    OpenInTerminal { target: String },
}
```

### Action Metadata

Each action variant carries enough data to execute independently. The frontend does not need to look up the result to execute an action.

Actions that need confirmation are identified by type — `Delete` always requires confirmation. This is hardcoded, not per-instance configurable. If a kit needs a custom confirmable action, it uses `Custom` with `requires_confirmation: true`.

### Frontend (`KitAction` TypeScript)

```typescript
type KitAction =
  | { type: "Open"; target: string }
  | { type: "Copy"; text: string; label?: string }
  | { type: "FocusWindow"; window_id: number }
  | { type: "OpenApp" }
  | { type: "Paste"; text: string }
  | { type: "ActivateCommand"; kit_id: string; command_id: string }
  | { type: "Custom"; id: string; label: string; requires_confirmation?: boolean }
  | { type: "RevealInFileManager"; target: string }
  | { type: "CopyPath"; path: string }
  | { type: "CopyName"; name: string }
  | { type: "Delete"; target: string }
  | { type: "OpenInEditor"; target: string }
  | { type: "OpenInTerminal"; target: string };
```

### Action Labels & Icons

The frontend derives display labels and icons from the action type. This mapping is a single function, not per-action metadata:

```typescript
function getActionLabel(action: KitAction): string;
function getActionIcon(action: KitAction): ReactNode;
function actionRequiresConfirmation(action: KitAction): boolean;
```

Platform-specific labels (e.g., "Reveal in Finder" vs "Show in Explorer") are injected from the Rust side via a one-time platform info query, or embedded in the action data.

## Settings

Two new fields in the `[general]` section of `config.toml`:

```toml
[general]
hotkey = "CmdOrCtrl+Shift+Space"
launch_at_login = false
terminal = "auto"
editor = "auto"
```

### Default Editor

- `"auto"` (default): detect from `$VISUAL`, then `$EDITOR` environment variables. If neither is set, the action is hidden.
- Explicit value: the launch command (e.g., `"code"`, `"nvim"`, `"zed"`, `"subl"`).
- Used by the `OpenInEditor` action.

### Default Terminal

- `"auto"` (default): detect from `$TERM_PROGRAM` (macOS), `$TERMINAL` (Linux), or fall back to platform default (Terminal.app, cmd.exe).
- Explicit value: the launch command (e.g., `"warp"`, `"iterm"`, `"alacritty"`).
- Used by the `OpenInTerminal` action.

### Settings UI

A future addition to the General settings panel: dropdowns for terminal and editor with common options and a "custom" freeform field. Not in initial scope — config file editing is sufficient.

## Future (deferred)

- **Settings UI for terminal/editor** — visual dropdown with common options and auto-detection display.
- **Action shortcuts outside the panel** — per-action global shortcuts (e.g., `⌘⌫` for Delete) without opening the panel. Intentionally deferred to keep the model simple.
- **Kit-declared action shortcuts** — kits declaring preferred key combos for their actions. Needs collision resolution.
- **Action groups** — visual grouping of related actions (e.g., "Copy" group with Copy Path and Copy Name).
- **Quick Look / preview** — holding a modifier on a result to preview content before acting.
