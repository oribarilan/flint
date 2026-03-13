# Kit System

Kits are the extension abstraction in Flint. They add capabilities — calculator, clipboard, stocks, window management — on top of core features. A Kit is a self-contained module that surfaces functionality through one or more of four surfaces.

**File search is not a kit.** It is core to Flint — the default behavior of the search bar, running on every keystroke with no prefix needed. Kits extend Flint; file search *is* Flint.

## Table of Contents

- [Core vs Kits](#core-vs-kits)
- [Surfaces](#surfaces)
- [Search Surface](#search-surface)
- [Chat Surface](#chat-surface)
- [App Window Surface](#app-window-surface)
- [Shortcut Surface](#shortcut-surface)
- [Search Result Model](#search-result-model)
- [Search Routing](#search-routing)
- [Chat Tool Calling](#chat-tool-calling)
- [Configuration](#configuration)
- [Settings UI](#settings-ui)
- [Planned Kits](#planned-kits)
- [Kit Infrastructure](#kit-infrastructure)
- [Design Principles](#design-principles)
- [Future (deferred)](#future-deferred)

## Core vs Kits

File search is the only core search feature. It owns the bare query — when the user opens Flint and types, they get file results with no prefix or keyword needed. It runs directly against the file index with no trait indirection, because it's the most performance-critical path and benefits from tight integration.

Everything else is a kit: calculator, clipboard, stocks, windows, weather, etc. Kits are activated by explicit user intent — a prefix or keyword at the start of the query. The AI can also invoke kit tools via chat without user prefixes.

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
│  │     Search · Chat · App Window · Shortcut               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                               ← prefix/kw   │
└─────────────────────────────────────────────────────────────┘
```

## Surfaces

Each Kit exposes functionality through up to four surfaces. All are opt-in — a kit implements only what it needs.

| Surface | Purpose | Trigger | Latency Budget |
|---------|---------|---------|----------------|
| **Search** | Inline results in the launcher | Prefix or keyword match | <10ms per keystroke |
| **Chat** | AI-invocable tools (function calling) | LLM decides to call | Async, seconds OK |
| **App Window** | Dedicated full UI | Explicit open (from result action, shortcut, or chat) | N/A |
| **Shortcut** | Global hotkey | Key combination | Immediate |

## Search Surface

A kit activates during search when the user explicitly invokes it with a **prefix** or **keyword** at the start of the query.

### Trigger Types

| Trigger | Example Query | Behavior |
|---------|--------------|----------|
| **Prefix** | `= 2+3`, `$ AAPL`, `@ paste` | Activates when query starts with the prefix character(s). Prefix is stripped before passing to the kit. |
| **Keyword** | `weather SF`, `define ephemeral` | Activates when query starts with the keyword followed by a space. Keyword is stripped before passing to the kit. |

If no kit trigger matches, the query goes to core file search. At most one kit is active for any given query — the first matching trigger wins. There is no cross-kit merging or multi-kit search.

### Performance Contract

Search is called on **every keystroke** when the trigger matches. Kits must return within 10ms. For kits that depend on external data (stocks, weather), the pattern is:

1. Cache data aggressively in the background.
2. Search returns from cache synchronously.
3. A background refresh runs independently.

## Chat Surface

A kit exposes **chat tools** — functions the AI can call during a conversation. Each tool has a name, description, and parameter schema (OpenAI function calling format).

When the user sends a chat message:
1. All chat tool definitions from enabled kits are included in the API request.
2. The model may respond with text, tool calls, or both.
3. Tool calls are dispatched to the owning kit, executed, and results sent back to the model.
4. The model uses tool results to form its final answer.

This loop repeats until the model responds with text content (no more tool calls).

### Tool Call UX

During tool execution:
- The chat panel shows a brief indicator: *"Using Calculator…"* or *"Looking up AAPL…"*
- Tool results are not shown raw — the AI incorporates them into its natural language response.
- If a tool call fails, the error is passed back to the model, which can explain the failure or retry.

## App Window Surface

A kit can declare a **dedicated app window** — a separate Tauri webview with its own UI. Examples:

- **Stocks Kit** → watchlist dashboard with charts
- **Clipboard Kit** → full clipboard history browser
- **Calculator Kit** → scientific calculator with history

App windows are opened by:
- Selecting a result action ("Open in Stocks")
- A global shortcut
- An AI suggestion in chat ("Here's your portfolio — [Open Stocks]")

Each app window uses the same visual language as Flint (dark theme, design tokens, glassmorphism) but has its own layout. The window URL follows the pattern: `index.html?page=kit&kit={kit_id}`.

## Shortcut Surface

A kit can register **global keyboard shortcuts** that work system-wide, even when Flint is hidden.

| Example | Kit | Action |
|---------|-----|--------|
| `CmdOrCtrl+Shift+V` | Clipboard | Show Flint with clipboard history |
| `CmdOrCtrl+Shift+W` | Windows | Show Flint with window list |

When a kit's shortcut fires, the kit returns an action:

| Action | Behavior |
|--------|----------|
| **Show overlay with query** | Open Flint with a pre-filled query (e.g., `@` for clipboard) |
| **Show overlay with kit** | Open Flint filtered to a specific kit's results |
| **Open app window** | Open the kit's dedicated window directly |

Kit shortcuts are registered at app startup alongside Flint's global hotkey. They do not conflict with it — the global shortcut system handles all of them.

## Search Result Model

All kits return results in a unified format. This ensures consistent rendering and behavior across kits.

### Result Structure

| Field | Required | Description |
|-------|----------|-------------|
| **id** | ✓ | Unique within the kit |
| **title** | ✓ | Primary display text |
| **subtitle** | | Secondary text (path, description, etc.) |
| **icon** | | Kit-level default or per-result override |
| **accessories** | | Right-aligned metadata: text labels, colored badges, small icons |
| **actions** | ✓ | Ordered list. First action = default (Enter). Others shown on expansion. |
| **preview** | | Optional inline preview (text, markdown, or HTML) |
| **score** | | Numeric relevance score for cross-kit ranking |

### Actions

Each result carries an ordered list of actions. The first action fires on **Enter**. Additional actions are accessible via **Tab** or a secondary gesture (right-arrow, context menu — TBD).

| Action | Description |
|--------|-------------|
| **Copy** | Copy text to clipboard |
| **Open** | Open file/URL with system handler |
| **Focus Window** | Raise and focus a system window |
| **Open App** | Open the kit's app window |
| **Paste** | Write to clipboard + simulate paste |
| **Custom** | Kit-defined action (identified by ID) |

After executing an action, Flint hides the overlay — unless the action explicitly requests staying open (e.g., "copy" might want to keep the launcher visible for more copies).

### Rendering

A **default result component** renders any kit's results using the standard layout: icon + title/subtitle on the left, accessories on the right, keyboard hint for the first 9 results. This covers most kits.

Kits that need custom rendering (charts, rich previews, multi-line layouts) provide their own React component. The frontend resolves which component to use via a **kit component registry** keyed by kit ID, falling back to the default.

## Search Routing

Search queries are routed to exactly one handler: either a kit or core file search.

```
User types query
  → Does query match any kit's prefix or keyword?
     YES → Strip prefix/keyword, dispatch to that kit
     NO  → Dispatch to core file search
```

There is no cross-kit merging, no tier system, no score normalization. One query, one handler, one set of results. This keeps the mental model simple and the code path fast.

### Core File Search Ranking

When a bare query goes to core file search, results are ranked by:

1. **Application boost** — applications rank above files and directories at equal fuzzy scores. Apps are what most users reach for in a launcher.
2. **Fuzzy match score** — nucleo score for the match quality.
3. **Global cap** — 20 results max.

### Kit Search

When a kit handles the query, it owns all result slots (up to 20). The kit provides its own relevance scoring.

### Edge Cases

- Kit trigger matches but kit returns zero results → empty results (no fallback to file search, the user explicitly invoked the kit).
- Empty query → no results (same as today).
- Query is just the prefix character (e.g., `=` with nothing after) → kit receives empty string, can return default/recent results or nothing.

## Chat Tool Calling

### Request Flow

```
User message
  → Collect chat tool definitions from all enabled kits
  → Build API request: messages + tools array
  → Stream response from provider
  → Parse response:
      Text content → stream tokens to frontend (existing flow)
      Tool calls   → dispatch to kits → append results → re-send to API
  → Repeat until the model returns text (no tool calls)
```

### Tool Definition Format

Each chat tool is described with:
- **name** — function name (e.g., `calculate`, `get_stock_price`)
- **description** — what it does (for the model)
- **parameters** — JSON Schema for the function arguments

These are passed to the API in the OpenAI function calling format. The model decides when and how to use them.

### Limits

- **Max tool calls per turn**: 10 (prevent infinite loops)
- **Max tool call rounds**: 5 (model can call tools, get results, call more tools — up to 5 rounds)
- **Timeout per tool invocation**: 10 seconds

If limits are hit, the model receives an error message and must respond with text.

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

Each kit owns a section of the config file under `[kits.<id>]`. Every kit has an `enabled` flag (default: `true`). Additional kit-specific settings vary.

```toml
[kits.calculator]
enabled = true

[kits.clipboard]
enabled = true
max_history = 200
excluded_apps = ["1Password"]

[kits.stocks]
enabled = true
watchlist = ["AAPL", "GOOGL", "MSFT"]

[kits.weather]
enabled = true
location = "San Francisco"

[kits.windows]
enabled = true
```

Missing sections or keys fall back to kit-defined defaults. Disabling a kit (`enabled = false`) unregisters it from all surfaces — no search results, no chat tools, no shortcuts.

## Settings UI

### Kits Page

A new **"Kits"** category in the Settings sidebar. Displays all registered kits as a list:

```
┌────────────┬─────────────────────────────────┐
│            │  Kits                           │
│  General   │                                 │
│  Appearance│  ┌─────────────────────────┐    │
│  Search    │  │ 🧮 Calculator    [on]  │    │
│  Chat      │  │ 📋 Clipboard     [on]  │    │
│  Kits  ←   │  │ 📈 Stocks        [off] │    │
│            │  │ 🌤 Weather       [off] │    │
│            │  │ 🪟 Windows       [on]  │    │
│            │  └─────────────────────────┘    │
│            │                                 │
│  v0.1.0    │  ▾ Clipboard                    │
│            │    Max history: 200             │
│            │    Excluded apps: 1Password     │
└────────────┴─────────────────────────────────┘
```

- Each kit shows its name, icon, trigger prefix/keyword, and an enable/disable toggle.
- Clicking a kit expands its settings inline (if it has any).
- The Search settings page remains separate — it configures core file search (directories, excludes, depth), not a kit.

## Planned Kits

| Kit | Search Trigger | Chat Tools | App Window | Shortcut |
|-----|---------------|------------|------------|----------|
| **Calculator** | Prefix: `=` | `calculate` | — | — |
| **Clipboard** | Prefix: `@` | `get_clipboard`, `paste_entry` | ✓ History browser | `CmdOrCtrl+Shift+V` |
| **Windows** | Keyword: `win` | `list_windows`, `focus_window` | — | `CmdOrCtrl+Shift+W` |
| **Stocks** | Prefix: `$` | `get_stock_price`, `get_watchlist` | ✓ Watchlist dashboard | — |
| **Weather** | Keyword: `weather` | `get_weather` | — | — |

File search is a core feature, not a kit. The AI can also search files via a built-in `search_files` chat tool (not part of any kit).

## Kit Infrastructure

Kits get shared infrastructure from the core so they don't each reinvent plumbing. This matters at scale — with 10-15 kits, duplicated boilerplate becomes a maintenance burden.

### KitContext

Every kit receives a `KitContext` at init time. It provides:

| Resource | Purpose |
|----------|---------|
| **App handle** | Tauri window management, event emission |
| **Config** | Read/write the kit's own config section |
| **HTTP client** | Shared `reqwest::Client` with connection pooling. Kits that call APIs (stocks, weather) use this instead of creating their own. |
| **Data directory** | Per-kit persistent storage path (`~/.config/flint/kits/<id>/`). For caches, databases, history files. |
| **Event emitter** | Send typed events to the frontend (e.g., progress updates, background refresh notifications). |

Kits store a reference to their context and use it throughout their lifetime.

### Lifecycle: Lazy Init

Kits are **registered** at startup but **initialized lazily** — on first use. "First use" means the first time a kit's trigger matches a search query, or the first time a chat tool from that kit is called.

This keeps app launch fast. A stocks kit that calls an API, a clipboard kit that hooks OS events, a weather kit that fetches location — none of these run until the user actually needs them.

The registry tracks init state per kit: `Registered → Initializing → Ready → Failed`. On first trigger match, the kit is initialized (async). The first query may return zero results while init completes; subsequent queries hit the Ready kit normally.

### Background Tasks

Kits that need long-running work — clipboard monitors, periodic API refreshes, file watchers — declare **background tasks**. The registry manages their lifecycle:

- Tasks are spawned during `init()` and return a handle (e.g., `tokio::JoinHandle` or an abort handle).
- The registry tracks all active task handles per kit.
- On shutdown or kit disable, the registry aborts all tasks for that kit.
- Kits don't manage their own `tokio::spawn` cleanup — the infrastructure handles it.

This prevents leaked tasks when kits are disabled at runtime or the app shuts down.

## Design Principles

1. **Core is core, kits are extensions.** File search is built into Flint — it's the default, always-on, zero-prefix experience. Kits add capabilities on top without touching core code.

2. **Kits are explicit.** Every kit requires a prefix or keyword to activate in search. No implicit pattern matching, no always-on kits competing with file search. The user's intent is unambiguous.

3. **Kits are self-contained.** A kit owns its Rust logic, its React components, and its config. Adding a kit does not require modifying core Flint code beyond one line of registration.

4. **Surfaces are opt-in.** A calculator doesn't need an app window. A window manager may not need chat tools. Each kit picks its surfaces.

5. **Search is fast, chat is smart.** Search runs synchronously on every keystroke (<10ms). Chat tools run asynchronously and can take seconds. Don't conflate the two.

6. **One IPC command per surface, not per kit.** The commands are `search_all`, `invoke_chat_tool`, `open_kit_app`, `handle_kit_shortcut`. The registry dispatches internally. Kits don't pollute the IPC namespace.

7. **Defaults should just work.** All built-in kits are enabled by default. A fresh install works with zero configuration. Power users tune via Settings or `config.toml`.

8. **The default renderer covers 80%.** Most kits don't need custom React components — the generic result component (icon + title + subtitle + accessories) handles them. Custom components are for exceptional cases (charts, rich previews).

9. **The core provides infrastructure, kits provide capability.** HTTP clients, data storage, event channels, task lifecycle — these are shared services from the core. Kits focus on their domain logic, not boilerplate.

## Future (deferred)

- **Pattern triggers** — auto-detect math expressions, URLs, etc. without requiring a prefix. Can be layered on top of the explicit-only model later.
- **Dynamic plugin loading** — load kits at runtime from WASM or JS bundles. The trait is designed to support this, but all kits are currently compiled-in.
- **Kit marketplace** — discover and install community kits. Requires dynamic loading first.
- **Inter-kit communication** — kits calling each other (e.g., calculator result → clipboard).
- **Kit permissions** — fine-grained control over what a kit can access (network, filesystem, clipboard). Only relevant for third-party kits.
- **Result preview pane** — a side panel showing rich previews when a result is selected. Kits provide preview content; Flint renders the pane.
