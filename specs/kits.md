# Kit System

Kits are the extension abstraction in Flint. They add capabilities — calculator, clipboard, stocks, window management — on top of core features. A Kit is a self-contained module that exposes **commands** as its primary primitive.

**File search is not a kit.** It is core to Flint — the default behavior of the search bar, running on every keystroke with no prefix needed. Kits extend Flint; file search *is* Flint.

## Table of Contents

- [Core vs Kits](#core-vs-kits)
- [Commands](#commands)
- [Search Result Model](#search-result-model)
- [Search Routing](#search-routing)
- [Chip UX](#chip-ux)
- [App Window Surface](#app-window-surface)
- [Configuration](#configuration)
- [Settings UI](#settings-ui)
- [Planned Kits](#planned-kits)
- [Kit Infrastructure](#kit-infrastructure)
- [Design Principles](#design-principles)
- [Future (deferred)](#future-deferred)

## Core vs Kits

File search is the only core search feature. It owns the bare query — when the user opens Flint and types, they get file results with no prefix or keyword needed. It runs directly against the file index with no trait indirection, because it's the most performance-critical path and benefits from tight integration.

Everything else is a kit: calculator, clipboard, stocks, windows, weather, etc. Kits are activated by explicit user intent — a prefix at the start of the query, or by selecting a command from discovery results.

```
┌─────────────────────────────────────────────────────────────┐
│                         Flint                                │
│                                                              │
│  ┌─────────────────────────────────┐                         │
│  │     Core: File Search           │  ← bare queries         │
│  │     (indexer + nucleo + ranking) │                         │
│  └─────────────────────────────────┘                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    KitRegistry                           │ │
│  │  ┌──────┐ ┌───────┐ ┌──────────┐ ┌───────┐ ┌───────┐  │ │
│  │  │ Calc │ │Stocks │ │Clipboard │ │Windows│ │Weather│  │ │
│  │  └──┬───┘ └───┬───┘ └────┬─────┘ └───┬───┘ └───┬───┘  │ │
│  │     └─────────┴──────────┴────────────┴─────────┘      │ │
│  │     Commands · App Windows                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                          ← prefix / chip     │
└─────────────────────────────────────────────────────────────┘
```

## Commands

Commands are the primary primitive kits expose. A command is a unit of functionality that:

1. **Is discoverable via search** — type "calc" and the Calculator command appears alongside files and apps.
2. **Can have a prefix** — e.g., `= 2+3` activates Calculator with input `2+3`.
3. **Can have a hotkey** — e.g., `CmdOrCtrl+Shift+=` activates Calculator from anywhere on the system.

### Command Definition

| Field | Required | Description |
|-------|----------|-------------|
| **id** | ✓ | Unique within the kit (e.g., `"calculate"`) |
| **name** | ✓ | Human-readable name (e.g., `"Calculator"`) |
| **description** | ✓ | One-line description |
| **icon** | ✓ | Emoji, named icon, or data URI |
| **mode** | ✓ | `InputResults` or `Execute` |
| **default_prefix** | | Prefix that auto-activates this command (e.g., `"="`) |
| **default_hotkey** | | **Must be `None`.** Kits never ship with default hotkeys — users assign hotkeys through Settings. Field exists for user-configured overrides only. |

### Command Modes

- **`InputResults`** — Activates a chip in the search bar. The user types a sub-query and sees results (e.g., Calculator, Clipboard History).
- **`Execute`** — Runs immediately when selected. No sub-search flow (e.g., Clear Clipboard, Toggle Dark Mode).

### Result Kinds

Every search result has a **kind**: `Application`, `File`, `Directory`, or `Command`. Commands appear in search results alongside files and apps, ranked by fuzzy match on their name.

### Performance Contract

Search within a command (`InputResults` mode) is called on **every keystroke** — must return within 10ms. For kits with external data, cache aggressively and return from cache synchronously.

## Search Result Model

All kits return results in a unified format. This ensures consistent rendering and behavior across kits.

### Result Structure

| Field | Required | Description |
|-------|----------|-------------|
| **id** | ✓ | Unique within the kit |
| **title** | ✓ | Primary display text |
| **subtitle** | | Secondary text (path, description, etc.) |
| **icon** | | Kit-level default or per-result override |
| **kind** | ✓ | `Application`, `File`, `Directory`, or `Command` |
| **accessories** | | Right-aligned metadata: text labels, colored badges, small icons |
| **actions** | ✓ | Ordered list. First action = default (Enter). |
| **preview** | | Optional inline preview (text, markdown, or HTML) |
| **score** | | Numeric relevance score for cross-kit ranking |

### Actions

Each result carries an ordered list of actions. The first action fires on **Enter** (the default action). All actions are accessible via the **Action Panel** — see `specs/action-panel.md` for the full interaction model.

| Action | Description |
|--------|-------------|
| **Copy** | Copy text to clipboard |
| **Open** | Open file/URL with system handler |
| **Focus Window** | Raise and focus a system window |
| **Open App** | Open the kit's app window |
| **Paste** | Write to clipboard + simulate paste |
| **Activate Command** | Activate a command's chip in the search bar |
| **Custom** | Kit-defined action (identified by ID) |

After executing an action, Flint hides the overlay — unless the action explicitly requests staying open.

### Rendering

A **default result component** renders any kit's results using the standard layout: icon + title/subtitle on the left, accessories on the right, keyboard hint for the first 9 results. This covers most kits.

Kits that need custom rendering provide their own React component via the **kit component registry**, falling back to the default.

## Search Routing

Search queries are routed to exactly one handler: either an active command, a prefix match, or core file search.

```
User types query
  → Is a command chip active?
       YES → Route to that command's search (via search_command IPC)
  → Does query match a command prefix + space?
       YES → Activate chip, strip prefix, route to that command
  → Does query match any registered prefix?
       YES → Strip prefix, dispatch to that command's kit
       NO  → Dispatch to core file search + command discovery
```

There is no cross-kit merging. One query, one handler, one set of results.

### Core File Search Ranking

When a bare query goes to core file search, results are ranked by:

1. **Application boost** — applications rank above files and directories at equal fuzzy scores.
2. **Fuzzy match score** — nucleo score for match quality.
3. **Command discovery** — commands whose name matches the query are merged in, ranked by the same fuzzy scoring.
4. **Global cap** — 20 results max.

### Edge Cases

- Command prefix matches but kit returns zero results → empty results (no fallback to file search).
- Empty query → no results.
- Query is just the prefix (e.g., `=` with nothing after) → kit receives empty string, can return default/recent results.

## Chip UX

When a user selects an `InputResults` command (from discovery or prefix), the search bar shows a **chip**: `[Calculator]` followed by a free-text input.

- Typing a prefix followed by a space (e.g., `= `) auto-activates the chip. The prefix is replaced by the chip and any remaining text becomes the input.
- **Escape** when a chip is active pops the chip (returns to main search). This is the first layer of the Escape cascade — before clearing input, clearing chat, or hiding the window.
- When a chip is active, the search hook routes queries to the `search_command` IPC instead of `search_all`.

## App Window Surface

A kit can declare a **dedicated app window** — a separate Tauri webview with its own UI. Examples:

- **Stocks Kit** → watchlist dashboard with charts
- ~~**Clipboard Kit**~~ — uses chip + result list only (no dedicated window)

App windows are opened by selecting a result action ("Open in Stocks") or a global shortcut. Each app window uses the same visual language as Flint (dark theme, design tokens) but has its own layout.

## Configuration

### Core Search Config

File search configuration stays in the top-level `[search]` section. It is not a kit.

```toml
[search]
directories = ["~/Desktop", "~/Documents", "~/Downloads", "/Applications"]
exclude = ["node_modules", ".git", "target"]
max_depth = 6
```

### Per-Kit Config

Each kit owns a section of the config file under `[kits.<id>]`. Every kit has an `enabled` flag (default: `true`). Individual commands can be toggled and have their prefix overridden.

```toml
[kits.calculator]
enabled = true

[kits.calculator.commands.calculate]
enabled = true
prefix = "="

[kits.clipboard]
enabled = true
max_history = 200
excluded_apps = ["1Password"]

[kits.stocks]
enabled = true
watchlist = ["AAPL", "GOOGL", "MSFT"]
```

Missing sections or keys fall back to kit-defined defaults. **Kit configuration changes (enable/disable, prefix changes) require an app restart to take effect.** The Settings UI shows a restart prompt when any kit setting changes.

Disabled kits are skipped entirely at registration — they produce no search results, no prefix activation, and no commands. Disabled commands within an enabled kit are similarly excluded.

## Settings UI

### Kits Page

The **"Kits"** category in the Settings sidebar. Each kit is displayed as an expandable card:

```
┌────────────┬─────────────────────────────────┐
│            │  Kits                           │
│  General   │                                 │
│  Appearance│  ┌ Restart required ── [Restart]│
│  Search    │                                 │
│  Chat      │  ┌─────────────────────────┐    │
│  Kits  ←   │  │ ▸ Calculator      [on]  │    │
│            │  └─────────────────────────┘    │
│            │  ┌─────────────────────────┐    │
│            │  │ ▾ Clipboard       [on]  │    │
│  v0.1.0    │  │   calculate  = ·  [on]  │    │
│            │  └─────────────────────────┘    │
└────────────┴─────────────────────────────────┘
```

- Each kit shows its name and an enable/disable toggle.
- Clicking a kit name expands it to show its **commands**.
- Each command shows its name, an editable prefix input, and its own enable/disable toggle.
- A restart banner appears at the top when any setting has changed from its loaded state.

## Planned Kits

| Kit | Commands | Default Prefix | App Window |
|-----|----------|---------------|------------|
| **Calculator** | `calculate` (InputResults) | `=` | — |
| **Clipboard** | `history` (InputResults), `clear` (Execute) | — | — |
| **Windows** | `list` (InputResults) | `win` | — |
| **Stocks** | `quote` (InputResults) | `$` | ✓ Watchlist dashboard |
| **Weather** | `forecast` (InputResults) | `weather` | — |

File search is a core feature, not a kit.

## Kit Infrastructure

Kits get shared infrastructure from the core so they don't each reinvent plumbing.

### KitContext

Every kit receives a `KitContext` at init time:

| Resource | Purpose |
|----------|---------|
| **App handle** | Tauri window management, event emission |
| **Config** | Read/write the kit's own config section |
| **HTTP client** | Shared `reqwest::Client` with connection pooling |
| **Data directory** | Per-kit persistent storage (`~/.config/flint/kits/<id>/`) |
| **Event emitter** | Kit-scoped events to the frontend |

### Lifecycle: Lazy Init

Kits are **registered** at startup (with config applied) but **initialized lazily** — on first use. "First use" means the first time a command's prefix matches or the user activates a command from discovery.

The registry tracks init state per kit: `Registered → Initializing → Ready → Failed`. The first query may return zero results while init completes; subsequent queries hit the Ready kit normally.

### Background Tasks

Kits that need long-running work declare **background tasks**. The registry manages their lifecycle:

- Tasks are spawned during `init()` and tracked via abort handles.
- On shutdown, the registry aborts all tasks for all kits.
- Kits don't manage their own `tokio::spawn` cleanup — the infrastructure handles it.

## Design Principles

1. **Core is core, kits are extensions.** File search is built into Flint — the default, always-on, zero-prefix experience. Kits add capabilities on top.

2. **Commands are the primitive.** Every kit capability is a command: discoverable, prefix-triggerable, individually toggleable.

3. **Kits are explicit.** Every kit requires a prefix or explicit selection to activate in search. No implicit pattern matching, no always-on kits competing with file search.

4. **Kits are self-contained.** A kit owns its Rust logic, its React components, and its config. Adding a kit requires one line of registration.

5. **Search is fast.** Search runs synchronously on every keystroke (<10ms). Never block on I/O in the search path.

6. **One IPC command per operation, not per kit.** `search_all`, `search_command`, `execute_command`. The registry dispatches internally.

7. **Defaults should just work.** All built-in kits are enabled by default. A fresh install works with zero configuration. Power users tune via Settings.

8. **No default hotkeys.** Kit commands never ship with pre-assigned hotkey bindings. Hotkeys are always user-configured through Settings. This avoids conflicts with other apps and keeps Flint's keyboard footprint minimal until the user opts in.

9. **The default renderer covers 80%.** Most kits don't need custom React components. Custom components are for exceptional cases.

10. **The core provides infrastructure, kits provide capability.** HTTP clients, data storage, event channels, task lifecycle — these are shared services.

## Future (deferred)

- **Chat tools / agent tools** — kit-provided functions the AI can call during chat. Removed from the Kit trait in the current pass; will be re-added as a separate, more considered surface.
- **Pattern triggers** — auto-detect math expressions, URLs, etc. without requiring a prefix.
- **Dynamic plugin loading** — load kits at runtime from WASM or JS bundles.
- **Kit marketplace** — discover and install community kits.
- **Inter-kit communication** — kits calling each other (e.g., calculator result → clipboard).
- **Kit permissions** — fine-grained control over what a kit can access. Only relevant for third-party kits.
- **Result preview pane** — a side panel showing rich previews when a result is selected.
