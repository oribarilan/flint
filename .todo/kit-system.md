# Kit System — Extensible Tool Architecture

## Summary

Introduce **Kits** as the extension abstraction for Flint capabilities beyond file search. A Kit is a self-contained module that surfaces functionality through up to four surfaces: search inline, chat tools, app windows, and global shortcuts.

**File search is core to Flint, not a kit.** It runs on bare queries with no prefix, owns the hot path, and talks directly to the index with no trait indirection. Kits extend Flint with additional capabilities (calculator, clipboard, stocks, windows, weather, etc.) that are activated by explicit user intent — a prefix or keyword.

Adding a new capability = implementing a trait + registering it.

## Architecture Overview

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

## The Kit Trait (Rust)

```rust
/// A Kit is a self-contained capability module.
/// Implement only the surfaces your kit needs — all have default no-op impls.
#[async_trait]
pub trait Kit: Send + Sync {
    /// Identity and metadata.
    fn manifest(&self) -> KitManifest;

    /// Lifecycle: called lazily on first use. Access shared infrastructure via ctx.
    async fn init(&self, ctx: &KitContext) -> Result<(), KitError> { Ok(()) }

    /// Lifecycle: called on app shutdown for cleanup.
    async fn shutdown(&self) -> Result<(), KitError> { Ok(()) }

    // ── Surface 1: Search ──────────────────────────────────────

    /// How the user activates this kit in search. Returns None if the kit
    /// has no search surface (chat-only or shortcut-only).
    fn search_trigger(&self) -> Option<SearchTrigger> { None }

    /// Return results for the given query. Called on every keystroke
    /// when the trigger matches — must be fast (<10ms).
    /// The query has already been stripped of the prefix/keyword.
    fn search(&self, query: &str) -> Vec<KitResult> { vec![] }

    // ── Surface 2: Chat Tools ──────────────────────────────────

    /// OpenAI-compatible function definitions for the AI to call.
    fn chat_tools(&self) -> Vec<ChatToolDef> { vec![] }

    /// Execute a chat tool call. May be async (API calls, etc.).
    async fn invoke_chat_tool(
        &self,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, KitError> {
        Err(KitError::ToolNotFound(tool_name.to_string()))
    }

    // ── Surface 3: App Window ──────────────────────────────────

    /// Does this kit have a dedicated app view?
    fn app_window(&self) -> Option<AppWindowConfig> { None }

    // ── Surface 4: Global Shortcuts ────────────────────────────

    /// Shortcuts this kit wants to register.
    fn shortcuts(&self) -> Vec<KitShortcut> { vec![] }

    /// Handle a shortcut press. Returns an action to execute.
    async fn handle_shortcut(
        &self,
        shortcut_id: &str,
    ) -> Result<ShortcutAction, KitError> {
        Err(KitError::ShortcutNotFound(shortcut_id.to_string()))
    }
}
```

## Supporting Types

```rust
pub struct KitManifest {
    pub id: &'static str,          // "calculator", "stocks", "clipboard"
    pub name: &'static str,        // "Calculator"
    pub description: &'static str, // "Evaluate math expressions"
    pub icon: KitIcon,             // Icon identifier or inline SVG
}

/// Visual representation for a kit or individual result.
pub enum KitIcon {
    /// An emoji character: "🧮", "📋"
    Emoji(String),
    /// A named icon from the built-in icon set.
    Named(String),
    /// Inline data URI (e.g., base64 PNG for app icons).
    DataUri(String),
}

/// When a kit should activate during search.
/// Kits are always explicit — the user types a prefix or keyword to invoke them.
pub enum SearchTrigger {
    /// Activates when query starts with a prefix character(s): "= 2+3", "$ AAPL", "@ paste".
    /// The prefix is stripped before passing to search().
    Prefix(&'static str),
    /// Activates when query starts with a keyword followed by a space: "weather SF".
    /// The keyword is stripped before passing to search().
    Keyword(&'static str),
}

/// A single result from a kit's search.
pub struct KitResult {
    pub id: String,                     // Unique within this kit
    pub title: String,                  // Primary display text
    pub subtitle: Option<String>,       // Secondary text (path, description)
    pub icon: Option<KitIcon>,          // Per-result icon override
    pub accessories: Vec<Accessory>,    // Right-aligned metadata (badges, timestamps)
    pub actions: Vec<KitAction>,        // What happens on Enter, Tab, etc.
    pub preview: Option<KitPreview>,    // Inline preview data
    pub score: Option<u32>,             // For ranking among results
}

/// Actions a kit result can trigger.
pub enum KitAction {
    /// Copy text to clipboard (default for calculator, etc.).
    Copy { text: String, label: Option<String> },
    /// Open a file/URL with the system handler.
    Open { target: String },
    /// Focus a system window.
    FocusWindow { window_id: u64 },
    /// Open this kit's app window.
    OpenApp,
    /// Run a custom action handled by the kit.
    Custom { id: String, label: String },
    /// Paste text (write to clipboard + simulate Cmd+V).
    Paste { text: String },
}

/// Right-side accessories on a result row.
pub enum Accessory {
    Text(String),                    // "2 min ago"
    Badge { text: String, color: String },  // colored tag
    Icon(KitIcon),
}

/// Optional inline preview for richer results.
pub enum KitPreview {
    Text(String),                    // Plain text preview
    Markdown(String),                // Rendered markdown
    Html(String),                    // Raw HTML (sandboxed)
}

/// Chat tool definition (OpenAI function calling format).
pub struct ChatToolDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value, // JSON Schema
}

pub struct KitShortcut {
    pub id: String,                  // "clipboard-history"
    pub default_key: String,         // "CmdOrCtrl+Shift+V"
    pub description: String,         // "Show clipboard history"
}

pub enum ShortcutAction {
    ShowOverlayWithQuery(String),    // Open Flint with a pre-filled query
    ShowOverlayWithKit(String),      // Open Flint in kit-specific mode
    OpenAppWindow(String),           // Open kit's app window
    Custom(serde_json::Value),       // Kit handles it entirely
}

/// Kit-scoped event emitter. Wraps AppHandle::emit with per-kit event namespacing.
pub struct KitEventEmitter {
    app: AppHandle,
    kit_id: String,
}

impl KitEventEmitter {
    /// Emit a typed event to the frontend, namespaced as "kit:{kit_id}:{event}".
    pub fn emit<T: Serialize>(&self, event: &str, payload: T) -> Result<(), KitError> {
        self.app.emit(&format!("kit:{}:{}", self.kit_id, event), payload)?;
        Ok(())
    }
}

/// Resources available to kits during init and execution.
pub struct KitContext {
    pub app: AppHandle,                       // Tauri window management
    pub config: Arc<RwLock<FlintConfig>>,
    pub http: reqwest::Client,                // Shared HTTP client with connection pooling
    pub data_dir: PathBuf,                    // Per-kit persistent storage (~/.config/flint/kits/<id>/)
    pub events: KitEventEmitter,              // Kit-scoped event emission to frontend
    pub task_manager: TaskManager,            // Spawn and track background tasks
}
```

## KitRegistry

```rust
/// Tracks whether a kit has been initialized.
enum KitState {
    Registered,   // Known but not yet initialized
    Initializing, // init() in progress (prevent double-init)
    Ready,        // Fully operational
    Failed,       // init() failed — won't be retried automatically
}

/// Manages background tasks spawned by kits.
pub struct TaskManager {
    handles: Vec<tokio::task::AbortHandle>,
}

impl TaskManager {
    /// Spawn a background task and track its handle for cleanup.
    pub fn spawn<F>(&mut self, future: F)
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let handle = tokio::spawn(future);
        self.handles.push(handle.abort_handle());
    }

    /// Abort all tracked tasks (called on kit disable or app shutdown).
    pub fn abort_all(&self) {
        for handle in &self.handles {
            handle.abort();
        }
    }
}

pub struct KitRegistry {
    kits: HashMap<String, Box<dyn Kit>>,
    kit_states: HashMap<String, KitState>,
    /// Per-kit task managers for background task cleanup.
    task_managers: HashMap<String, TaskManager>,
    /// Trigger-to-kit mapping for search dispatch.
    search_kits: Vec<(SearchTrigger, String)>,
    /// All chat tool defs, collected once and refreshed on kit changes.
    chat_tool_index: Vec<(String, ChatToolDef)>, // (kit_id, def)
}

impl KitRegistry {
    pub fn new() -> Self { ... }

    pub fn register(&mut self, kit: Box<dyn Kit>) {
        let manifest = kit.manifest();
        if let Some(trigger) = kit.search_trigger() {
            self.search_kits.push((trigger, manifest.id.to_string()));
        }
        for tool in kit.chat_tools() {
            self.chat_tool_index.push((manifest.id.to_string(), tool));
        }
        self.kit_states.insert(manifest.id.to_string(), KitState::Registered);
        self.kits.insert(manifest.id.to_string(), kit);
    }

    /// Initialize a single kit lazily. Called on first use (first trigger
    /// match or first chat tool call).
    async fn ensure_init(&mut self, kit_id: &str, base_ctx: &KitContextBase) -> Result<(), KitError> {
        match self.kit_states.get(kit_id) {
            Some(KitState::Ready) => return Ok(()),
            Some(KitState::Initializing) => return Ok(()), // in progress, skip
            Some(KitState::Failed) => return Err(KitError::InitFailed(kit_id.to_string())),
            _ => {}
        }
        self.kit_states.insert(kit_id.to_string(), KitState::Initializing);
        let task_manager = TaskManager::new();
        let ctx = base_ctx.for_kit(kit_id, task_manager);
        match self.kits[kit_id].init(&ctx).await {
            Ok(()) => {
                self.kit_states.insert(kit_id.to_string(), KitState::Ready);
                self.task_managers.insert(kit_id.to_string(), ctx.task_manager);
                Ok(())
            }
            Err(e) => {
                self.kit_states.insert(kit_id.to_string(), KitState::Failed);
                Err(e)
            }
        }
    }

    /// Find which kit (if any) matches the query, and return its results.
    /// Returns None if no kit trigger matches (caller falls back to core file search).
    /// When a trigger matches but the kit isn't ready, returns empty results — never
    /// falls through to core file search for an explicitly invoked kit.
    pub fn search(&self, query: &str) -> Option<(String, Vec<KitResult>)> {
        let (trigger, kit_id) = self.search_kits.iter()
            .find(|(trigger, _)| trigger.matches(query))?;

        if !matches!(self.kit_states.get(kit_id), Some(KitState::Ready)) {
            // Kit not ready — return empty results. The caller (search_all command)
            // is responsible for spawning lazy init in the background.
            return Some((kit_id.clone(), vec![]));
        }

        let effective_query = trigger.effective_query(query);
        let kit = &self.kits[kit_id];
        let results = kit.search(effective_query);
        Some((kit_id.clone(), results))
    }

    /// All chat tool definitions for inclusion in API requests.
    pub fn all_chat_tools(&self) -> &[(String, ChatToolDef)] {
        &self.chat_tool_index
    }

    /// Dispatch a chat tool call to the owning kit.
    /// Ensures the kit is initialized before dispatching.
    pub async fn invoke_chat_tool(
        &self,
        kit_id: &str,
        tool_name: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, KitError> {
        let kit = self.kits.get(kit_id).ok_or(KitError::KitNotFound)?;
        kit.invoke_chat_tool(tool_name, args).await
    }

    /// Shutdown all kits and abort their background tasks.
    pub async fn shutdown_all(&mut self) {
        for (id, kit) in &self.kits {
            let _ = kit.shutdown().await;
            if let Some(tm) = self.task_managers.get(id) {
                tm.abort_all();
            }
        }
    }
}
```

## Frontend Architecture

### Unified SearchResult type

```typescript
interface KitSearchResult {
  kitId: string;                    // "core" for file search, "calculator", "stocks", etc.
  id: string;                       // unique within kit
  title: string;
  subtitle?: string;
  icon?: KitIcon;
  accessories?: Accessory[];
  actions: KitAction[];             // first action = default (Enter)
  preview?: KitPreview;
  score?: number;
}
```

### Kit Component Registry

Each kit registers frontend components for rendering its results:

```typescript
interface KitComponents {
  /** Renders a search result row for this kit. */
  SearchResult: React.FC<{ result: KitSearchResult; isSelected: boolean }>;
  /** Renders a chat tool-call result in the chat panel. */
  ChatCard?: React.FC<{ toolName: string; args: unknown; result: unknown }>;
  /** Full app view for the kit's dedicated window. */
  AppView?: React.FC;
}

// Component registry — maps kit IDs to their React components.
const KIT_REGISTRY: Record<string, KitComponents> = {};

export function registerKit(kitId: string, components: KitComponents) {
  KIT_REGISTRY[kitId] = components;
}

export function getKitComponents(kitId: string): KitComponents {
  return KIT_REGISTRY[kitId] ?? KIT_REGISTRY["_default"];
}
```

### Default result component

A generic `DefaultKitResult` component handles any kit that doesn't provide a custom renderer — renders title, subtitle, icon, accessories. Most kits won't need a custom component; the default covers 80% of cases.

### ResultsList changes

```tsx
function ResultsList() {
  const results = useSearchStore((s) => s.results); // now KitSearchResult[]

  return results.map((result) => {
    const { SearchResult } = getKitComponents(result.kitId);
    return <SearchResult key={`${result.kitId}:${result.id}`} result={result} />;
  });
}
```

### App window routing

```tsx
// main.tsx
const page = new URLSearchParams(window.location.search).get("page");
const kitId = new URLSearchParams(window.location.search).get("kit");

if (page === "settings") return <Settings />;
if (page === "kit" && kitId) {
  const { AppView } = getKitComponents(kitId);
  return AppView ? <AppView /> : <div>Kit not found</div>;
}
return <App />;
```

## Search Pipeline Changes

### Current flow:
```
query → search_files() → Vec<SearchResult> (files only)
```

### New flow:
```
query → search_all()
          ↓
  Does query match any kit trigger?
    YES → strip prefix/keyword → dispatch to kit → return KitSearchResult[]
    NO  → core file search → return KitSearchResult[] (with app boost)
```

Core file search results are converted to `KitSearchResult` format with `kitId: "core"`. Applications get a ranking boost above files and directories at equal fuzzy scores.

The routing is simple: check each registered trigger in order, first match wins. If no match, fall through to core file search. No cross-kit merging, no score normalization.

## Chat Pipeline Changes

### Current flow:
```
user message → build request body (messages only) → stream response
```

### New flow:
```
user message
  → collect all chat_tools() from KitRegistry
  → build request body with messages + tools array
  → stream response
  → if response contains tool_calls:
      → dispatch each to KitRegistry.invoke_chat_tool()
      → append tool results as tool-role messages
      → send follow-up request (model uses tool results to form answer)
      → repeat until model responds with content (not tool_calls)
  → stream final text response to frontend
```

### Tool call loop:
```rust
loop {
    let response = send_to_api(messages, tools).await;
    match response {
        TextContent(text) => {
            emit_tokens(text);
            break;
        }
        ToolCalls(calls) => {
            for call in calls {
                let result = registry.invoke_chat_tool(
                    &call.kit_id, &call.function.name, call.function.arguments
                ).await;
                messages.push(tool_result_message(call.id, result));
            }
            // Loop again — model will use tool results
        }
    }
}
```

## Config Integration

### Per-kit configuration

Each kit can declare a default config. Kit configs live under a `[kits]` section:

```toml
[kits.calculator]
enabled = true

[kits.stocks]
enabled = true
watchlist = ["AAPL", "GOOGL", "MSFT"]

[kits.clipboard]
enabled = true
max_history = 200
excluded_apps = ["1Password"]

[kits.weather]
enabled = true
location = "San Francisco"

[kits.windows]
enabled = true
```

Core file search config stays in `[search]` — it is not a kit.

### Settings UI

Add a **"Kits"** page to Settings:
- List of all registered kits with enable/disable toggles
- Click a kit → shows kit-specific settings (if any)
- Each kit declares its settings schema; a generic form renderer handles it
- Or kits can provide a custom settings component (for complex UIs)
- Search settings remain separate (core feature, not a kit)

## Migration Path

### Phase 1: Introduce the trait and registry

1. Define `Kit` trait, `KitRegistry`, and all supporting types in `src-tauri/src/kits/mod.rs`
2. Register the `KitRegistry` in `lib.rs` setup (no kits yet — file search stays core)
3. Add `search_all` command that checks kit triggers first, falls back to core file search
4. Add application ranking boost to core file search
5. Update frontend `SearchResult` type to `KitSearchResult`
6. Everything works exactly as before — no kits registered yet, all queries go to core file search

### Phase 2: Add chat tool calling

1. Extend the chat pipeline to include `tools` in API requests
2. Parse `tool_calls` from SSE responses
3. Implement the invoke → re-send loop
4. Add a built-in `search_files` chat tool (not part of a kit — core feature exposed to the AI)

### Phase 3: Add first new kits

- **CalculatorKit** — pure Rust math expression parser, prefix: `=`
- **ClipboardKit** — background watcher + history (already has a .todo), prefix: `@`
- **WindowsKit** — platform window listing (already has a .todo), keyword: `win`

### Phase 4: Rich kits

- **StocksKit** — API integration, app window with watchlist
- **WeatherKit** — API integration, inline forecast
- More as needed

## File Structure

```
src-tauri/src/
├── kits/
│   ├── mod.rs              # Kit trait, types, SearchTrigger
│   ├── registry.rs         # KitRegistry, TaskManager, KitState
│   ├── calculator.rs       # CalculatorKit (prefix: =)
│   ├── clipboard.rs        # ClipboardKit (prefix: @)
│   ├── windows.rs          # WindowsKit (keyword: win)
│   ├── stocks.rs           # StocksKit (prefix: $)
│   └── weather.rs          # WeatherKit (keyword: weather)
├── indexer.rs              # Core file indexer (unchanged)
├── search.rs               # Core file search with app boost (unchanged except ranking)
└── ...

src/
├── kits/
│   ├── registry.ts         # Frontend kit component registry
│   ├── DefaultKitResult.tsx # Generic result renderer
│   ├── calculator/
│   │   └── CalculatorResult.tsx
│   ├── clipboard/
│   │   ├── ClipboardResult.tsx
│   │   └── ClipboardApp.tsx  # App window view
│   ├── stocks/
│   │   ├── StockResult.tsx
│   │   ├── StockChatCard.tsx
│   │   └── StocksApp.tsx
│   └── ...
└── ...
```

## Design Principles

1. **Core is core, kits are extensions.** File search is built into Flint — it's the default, always-on, zero-prefix experience. Kits add capabilities on top without touching core code.

2. **Kits are explicit.** Every kit requires a prefix or keyword to activate in search. No implicit pattern matching, no always-on kits competing with file search. The user's intent is unambiguous.

3. **Kits are self-contained.** A kit owns its Rust logic, its React components, and its config schema. Adding a kit should not require modifying core Flint code beyond registering it.

4. **Surfaces are opt-in.** A kit only implements the surfaces it needs. A calculator doesn't need an app window. A window manager doesn't need chat tools (or maybe it does — your call).

5. **Search must be fast.** Kit `search()` is called on every keystroke when its trigger matches. It must return in <10ms. For kits that need async data (stocks, weather), cache aggressively and return cached results synchronously.

6. **Chat tools are async.** Unlike search, chat tool invocation can take time (API calls, computation). The AI naturally handles this — it waits for tool results before continuing.

7. **The default renderer handles most cases.** Don't require every kit to ship a custom React component. The `DefaultKitResult` component renders title/subtitle/icon/accessories and covers 80% of kits. Only build a custom component when you need truly custom rendering (charts, previews, etc.).

8. **Config is per-kit.** Each kit owns its section of the config file. The Settings UI renders kit config generically (from a declared schema) unless the kit provides a custom settings component.

9. **One IPC command per surface, not per kit.** The commands are `search_all`, `invoke_chat_tool`, `open_kit_app`, `handle_kit_shortcut` — not `calculator_search`, `stocks_search`. The registry dispatches internally.

10. **The core provides infrastructure, kits provide capability.** HTTP clients, data storage, event channels, task lifecycle — these are shared services from the core. Kits focus on their domain logic, not boilerplate.

## Out of Scope

- Dynamic/runtime plugin loading (WASM, JS) — future, trait is designed to support it
- Kit marketplace or distribution
- Inter-kit communication (kits calling other kits)
- Kit sandboxing or permission system
- Kit versioning or dependency management

---

## Implementation Plan

Four phases. Each phase produces a working app — no phase leaves things broken. Phase 1 is the structural change; the rest are additive.

### Phase 1 — Kit Abstraction + Search Routing

The goal is: introduce the Kit trait, KitRegistry, and the search routing layer (kit trigger → kit, no match → core file search). Add application ranking boost. Rewire the frontend to use `KitSearchResult`. Zero user-visible change in behavior — file search works exactly as before, but the kit infrastructure is in place.

#### 1a. Rust: Kit trait & types (`src-tauri/src/kits/mod.rs`)

Define the core types in a new `kits` module:

- `Kit` trait with default no-op impls for all surfaces (as designed above)
- `KitManifest` — id, name, description, icon
- `KitIcon` — Emoji, Named, DataUri
- `SearchTrigger` — Prefix, Keyword (only two variants, both explicit)
  - `SearchTrigger::matches(&self, query) -> bool`
  - `SearchTrigger::effective_query(&self, query) -> &str` (strips prefix/keyword)
- `KitResult` — id, title, subtitle, icon, accessories, actions, preview, score
- `KitAction` — Copy, Open, FocusWindow, OpenApp, Paste, Custom
- `Accessory` — Text, Badge, Icon
- `KitPreview` — Text, Markdown, Html
- `ChatToolDef` — name, description, parameters (JSON Schema)
- `KitShortcut`, `ShortcutAction`
- `KitContext` — holds AppHandle, config, shared HTTP client, per-kit data dir, KitEventEmitter, TaskManager
- `KitContextBase` — shared parts (AppHandle, config, HTTP client, base data dir). `for_kit(id)` produces a scoped `KitContext` with kit-specific data dir, event emitter, and task manager.
- `KitEventEmitter` — kit-scoped wrapper around AppHandle::emit, namespaces events as `kit:{id}:{event}`
- `TaskManager` — spawn tracked background tasks, abort all on shutdown
- `KitState` — Registered, Initializing, Ready, Failed
- `KitError` — thiserror enum: ToolNotFound, KitNotFound, ShortcutNotFound, InitFailed, Internal

All types derive `Serialize` where they'll cross IPC. `KitAction` needs careful serialization — the frontend must know which variant it's dealing with (use `#[serde(tag = "type")]`).

**Tests**: Unit tests for `SearchTrigger::matches` and `SearchTrigger::effective_query` for Prefix and Keyword. Edge cases: empty query, prefix-only query (e.g., `=` with nothing after), keyword without space. Unit tests for `TaskManager` — spawn, abort, abort_all.

#### 1b. Rust: KitRegistry (`src-tauri/src/kits/registry.rs`)

- `KitRegistry` struct holding `HashMap<String, Box<dyn Kit>>`
- Per-kit state tracking: `HashMap<String, KitState>` (Registered → Initializing → Ready → Failed)
- Per-kit `TaskManager` for background task lifecycle
- Trigger-to-kit mapping: `Vec<(SearchTrigger, String)>`
- Chat tool index: `Vec<(String, ChatToolDef)>`
- Methods:
  - `register(&mut self, kit: Box<dyn Kit>)` — insert + add to indexes, state = Registered
  - `ensure_init(&mut self, kit_id, base_ctx)` — lazy init on first use
  - `search(&self, query) -> Option<(String, Vec<KitResult>)>` — find first matching trigger, dispatch. Returns `None` if no kit matches (caller falls through to core file search). Returns `Some((kit_id, vec![]))` if kit matches but isn't ready (never falls through for explicitly invoked kits).
  - `all_chat_tools() -> &[(String, ChatToolDef)]`
  - `invoke_chat_tool(kit_id, tool_name, args) -> Result<Value>` — ensures init before dispatch
  - `shutdown_all()` — calls `kit.shutdown()` + `task_manager.abort_all()` for every kit

The registry is wrapped in `Arc<RwLock<KitRegistry>>` for Tauri state.

**Tests**: Register mock kits, verify dispatch. Prefix kit only activates on prefix match. Keyword kit activates on keyword + space. No-match → returns None. Kit matched but not ready → returns `Some((id, []))` (never falls through to core search). Lazy init: ready after init → returns results. Shutdown aborts all task managers.

#### 1c. Rust: Application ranking boost in core search

Modify `search.rs` to boost application results. Applications are what most users reach for in a launcher — they should rank above files and directories at equal fuzzy scores.

Implementation: after nucleo scoring, add a bonus to `EntryKind::Application` results. The bonus should be significant enough that apps rank first for short/ambiguous queries, but not so large that a weak app match beats a strong file match.

**Tests**: Search for "sl" returns "Slack.app" above "slackbot.py" at similar match quality. Search for an exact filename that isn't an app still returns the file first.

#### 1d. Rust: New IPC command + lib.rs wiring

- Add `search_all` command in `commands.rs`:
  ```rust
  #[tauri::command]
  async fn search_all(
      query: &str,
      registry: State<'_, KitRegistryState>,
      base_ctx: State<'_, KitContextBaseState>,
      index: State<'_, FileIndex>,
  ) -> Vec<KitSearchResult>
  ```
  - First: check `registry.read().search(query)` — if a kit matches:
    - If kit state is `Registered`, spawn `ensure_init()` in the background (don't await — the kit will be Ready by the next keystroke). Return empty results for now.
    - If kit state is `Ready`, return the kit's results.
    - If kit state is `Initializing` or `Failed`, return empty results.
  - Otherwise (no kit trigger matched): fall through to core file search (existing logic + app boost), wrap as `KitSearchResult` with `kitId: "core"`
  - Cap at 20 results

  The lazy init spawn requires cloning the `Arc<RwLock<KitRegistry>>` and `KitContextBase` into the spawned task:
  ```rust
  let registry_clone = registry.inner().clone();
  let ctx_clone = base_ctx.inner().clone();
  tokio::spawn(async move {
      let mut reg = registry_clone.write().await;
      let _ = reg.ensure_init(&kit_id, &ctx_clone).await;
  });
  ```

- `KitSearchResult` is the IPC type: `kit_id` + flattened `KitResult` fields. Core file search results are converted to this format too.

- In `lib.rs::run()`:
  - Create a shared `reqwest::Client`
  - Create `KitContextBase` (app handle, config, HTTP client, base data dir)
  - Create `KitRegistry` (empty — no kits registered yet in Phase 1)
  - `app.manage(KitRegistryState(Arc::new(RwLock::new(registry))))`
  - File indexer spawn stays in `lib.rs` as-is (it's core, not a kit)
  - Keep `search_files` as a thin wrapper that calls `search_all` internally (backward compat, remove later)

- Register `search_all` in the Tauri invoke handler.

**Tests**: Integration test — call search_all with no kits registered, verify core file search results come back as KitSearchResult. Call search_all with a mock prefix kit, verify kit results come back when prefix matches and core search results when it doesn't.

#### 1e. Frontend: Types + Kit component registry

- Create `src/kits/types.ts`:
  ```typescript
  interface KitSearchResult {
    kitId: string;                    // "core" for file search, kit id otherwise
    id: string;
    title: string;
    subtitle?: string;
    icon?: KitIcon;
    accessories?: Accessory[];
    actions: KitAction[];
    preview?: KitPreview;
    score?: number;
  }
  ```
  - `KitAction` as a discriminated union: `{ type: "copy", text: string } | { type: "open", target: string } | ...`

- Create `src/kits/registry.ts`:
  - `KitComponents` interface: `SearchResult`, optional `ChatCard`, optional `AppView`
  - `registerKit(kitId, components)` + `getKitComponents(kitId)` (falls back to default)
  - Register `"core"` with the existing file result renderer

- Create `src/kits/DefaultKitResult.tsx`:
  - Generic renderer: icon + title + subtitle on left, accessories on right, kbd hint
  - Current ResultsList row logic extracted into a reusable component
  - The core file result renderer is either this default or a thin wrapper of it

#### 1f. Frontend: Rewire search pipeline

- Update `src/lib/commands.ts`: add `searchAll(query: string): Promise<KitSearchResult[]>`
- Update `searchStore.ts`: change `results: SearchResult[]` → `results: KitSearchResult[]`
- Update `useSearch.ts`: call `searchAll` instead of `searchFiles`
- Update `ResultsList.tsx`: use `getKitComponents(result.kitId).SearchResult` to render each row
- Update `useKeybindings.ts`: action execution now reads `result.actions[0]` instead of hardcoded `openFile(result.path)`. Dispatch by action type:
  - `open` → `openFile(action.target)`
  - `copy` → clipboard write
  - etc.

**Tests**:
- Frontend: KitComponentRegistry — register, get, fallback to default
- Frontend: ResultsList renders KitSearchResults correctly
- Frontend: useSearch calls searchAll and updates store

#### 1g. Config: Add kits section

- Add `kits: HashMap<String, toml::Value>` to `FlintConfig` (or a typed `KitsConfig` struct)
- `[search]` stays as-is — it's core config, not a kit
- Kit configs live under `[kits.<id>]` with at minimum an `enabled` flag
- No migration needed — `[search]` is not moving

**Tests**: Config loading with `[kits.calculator]` section. Config with missing kits section → defaults.

### Phase 2 — Chat Tool Calling

Extend the chat pipeline to support function calling. The AI can now invoke kit tools and the built-in file search tool.

#### 2a. Extend SSE parser for tool calls

The current `extract_sse_tokens()` only handles `choices[0].delta.content`. Extend it to also detect:

```json
{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "index": 0,
        "id": "call_abc123",
        "function": { "name": "calculate", "arguments": "{\"expr\":\"2+2\"}" }
      }]
    }
  }]
}
```

Tool calls stream incrementally (arguments arrive in chunks, just like content). Accumulate `function.arguments` across deltas until the stream signals completion (via `finish_reason: "tool_calls"`).

New types:
```rust
struct ToolCallDelta { index: usize, id: Option<String>, function: FunctionDelta }
struct FunctionDelta { name: Option<String>, arguments: Option<String> }
struct AccumulatedToolCall { id: String, function_name: String, arguments: String }
```

**Tests**: Parse SSE streams containing tool calls. Test incremental argument accumulation. Test mixed content + tool calls.

#### 2b. Tool call dispatch loop

Modify `CopilotProvider::send_message()` (or add a higher-level orchestrator) to implement:

```
loop {
  response = stream_from_api(messages, tools)
  if response has text content → emit tokens, break
  if response has tool_calls →
    for each call:
      emit "chat:tool-start" { kit_id, tool_name }
      result = registry.invoke_chat_tool(kit_id, tool_name, args)
      emit "chat:tool-done" { kit_id, tool_name }
      append tool result message to messages
    continue loop (send again with tool results)
}
```

The `tools` array in the request body comes from `registry.all_chat_tools()` + the built-in `search_files` tool, formatted per OpenAI spec.

**Limits** (enforced in the loop):
- Max 10 tool calls per response
- Max 5 loop iterations (rounds)
- 10-second timeout per tool invocation (tokio::timeout)
- On limit hit: append an error message and force one final API call without tools

**Chat message types** expand: the `messages` array now includes `role: "tool"` messages with `tool_call_id`.

#### 2c. Built-in search_files chat tool

Add a `search_files` chat tool as a built-in (not part of any kit — it's core):
- Defined directly in the chat orchestrator alongside kit tools
- `search_files(query: string) -> [{ name, path, kind }]` — calls core search, returns top 10 as JSON
- The AI can now say "let me search for that file" and actually do it

#### 2d. Frontend: Tool call UX

- New events: `chat:tool-start`, `chat:tool-done` (emitted from Rust during the loop)
- `chatStore.ts`: add `activeToolCalls: { kitId: string, toolName: string }[]`
- `ChatPanel.tsx`: show inline indicator during tool execution: *"Using Files…"* or *"Using Calculator…"*
- Tool results are NOT shown raw — the AI incorporates them into its response

**Tests**: Chat store handles tool call events. ChatPanel renders tool indicators.

### Phase 3 — Calculator Kit (First Kit)

The simplest possible kit. Validates the entire architecture end-to-end.

#### 3a. Rust: CalculatorKit

- `manifest()` → id: "calculator", name: "Calculator"
- `search_trigger()` → `Some(SearchTrigger::Prefix("="))`
- `search(query)` → evaluate the expression, return one result:
  - title: the result (e.g., "42"), subtitle: the expression (e.g., "6 × 7")
  - action: `KitAction::Copy { text: "42" }`
- `chat_tools()` → `calculate(expression: string) -> string`

For evaluation, use a lightweight crate like `meval` or `fasteval`. No external API calls — pure computation.

**Tests**: Evaluate basic arithmetic, order of operations, parentheses, error on invalid input, edge cases (division by zero, overflow).

#### 3b. Frontend: CalculatorResult

- Custom result component showing the expression and result prominently
- Or just use `DefaultKitResult` if it looks good enough
- Register in kit component registry

#### 3c. Validate end-to-end

- Typing "= 2 + 3" → calculator result ("5"), Enter copies to clipboard
- Typing "readme" → core file search (no prefix match)
- Typing "= " (just prefix, empty query) → calculator can show help text or nothing
- In chat: "what is 2 + 3?" → AI calls `calculate` tool → responds with "5"


### Phase 4 — Kit Settings UI

#### 4a. Backend: Kit manifest for settings

Extend `KitManifest` (or add a new method to the trait):
```rust
fn settings_schema(&self) -> Option<serde_json::Value> { None }
```
Returns a JSON Schema describing the kit's configurable fields. The frontend renders a generic form from this schema.

Add IPC commands:
- `get_kit_manifests() -> Vec<KitManifest>` — list all registered kits with metadata
- `get_kit_config(kit_id) -> Value` — current config for a kit
- `update_kit_config(kit_id, config) -> ()` — update + persist

#### 4b. Frontend: Kits settings page

- Add "Kits" category to Settings sidebar (alongside General, Appearance, Search, Chat)
- Kit list: name + icon + trigger prefix/keyword + enable/disable toggle
- Expandable per-kit settings rendered from the kit's JSON Schema
- Search settings remain separate — core feature config

#### 4c. Config structure update

```toml
[kits.calculator]
enabled = true

[kits.clipboard]
enabled = true
max_history = 200
```

Each kit's `enabled` flag controls registration. Disabled kits are not registered in the KitRegistry and produce no results, no chat tools, no shortcuts.

### Dependency Graph

```
Phase 1a (types) ──┬──> Phase 1b (registry) ──> Phase 1c (app boost) ──> Phase 1d (IPC wiring)
                   │                                                           |
                   └──> Phase 1e (frontend types) ──────────────────> Phase 1f (frontend rewire)
                                                                               |
Phase 1g (config) <─── can happen in parallel with 1d-1f ────────────────────-┘
                                                                               |
                                                                ┌──── Phase 2a-d (chat tools)
                                                                │
                                                                ├──── Phase 3a-c (calculator kit)
                                                                │
                                                                └──── Phase 4a-c (settings UI)
```

Phases 2, 3, 4 are independent of each other and can be done in any order after Phase 1.

### Deferred Surface Commands

Two of the four IPC surface commands (`open_kit_app`, `handle_kit_shortcut`) are **not implemented in Phases 1–4** because no kit in those phases uses them:

- **`open_kit_app`** — needed when implementing the first kit with an app window (Clipboard history browser or Stocks dashboard). Add alongside that kit.
- **`handle_kit_shortcut`** — needed when implementing the first kit with a global shortcut (Clipboard `CmdOrCtrl+Shift+V` or Windows `CmdOrCtrl+Shift+W`). Add alongside that kit.

The types (`AppWindowConfig`, `KitShortcut`, `ShortcutAction`) are defined in Phase 1a so the trait is complete. The IPC wiring is deferred to avoid shipping dead code.

### Risks & Open Questions

1. **`search()` is sync but `init()` is async** — the trait uses `async fn init()` but `fn search()` is sync (for the <10ms contract). Kits that need async data for search must cache it. Document this pattern clearly for kit authors.

2. **Thread safety of `Box<dyn Kit>`** — the trait requires `Send + Sync`. The registry is behind `Arc<RwLock<>>`. Kits that hold mutable state must use interior mutability (`Arc<RwLock<>>` internally). Must be documented.

3. **Tool call argument streaming** — OpenAI-compatible APIs stream tool call arguments incrementally. The parser must accumulate chunks correctly, including handling multiple concurrent tool calls (identified by `index`). This is the trickiest part of Phase 2.

4. **`async_trait` crate** — the `Kit` trait has async methods (`init`, `shutdown`, `invoke_chat_tool`). Rust doesn't support async trait methods with dyn dispatch natively yet without boxing. Use `async_trait` crate or return `Pin<Box<dyn Future>>`. The `async_trait` crate is simpler.

5. **KitIcon representation** — defined as `Emoji(String) | Named(String) | DataUri(String)`. Covers built-in icons (emoji, named) and per-result icons (data URIs for app icons). May need extension later (e.g., SVG inline, icon packs) but this covers the launch set.

6. **Lazy init on first search** — `search()` is sync and can't await `ensure_init()`. When a kit trigger matches but the kit isn't Ready, `search()` returns `Some((kit_id, vec![]))` — empty results, but no fallback to core file search (the user explicitly invoked the kit). The `search_all` command handler (which is async) spawns `ensure_init()` in the background. The kit is Ready by the next keystroke (~50ms later given debounce). Acceptable UX for explicit-prefix kits since the user is still typing.

7. **Chat tool budget at scale** — with 15 kits x 2-3 tools each, ~40 tool definitions go into every API request. This consumes context window tokens. Mitigations: only include tools from enabled kits. Deferred until it's a measured problem.

8. **Application boost tuning** — the app ranking boost needs to feel right without being overwhelming. Start with a fixed bonus and tune based on real usage.
