# Kit v2 — Command Primitive

## Summary

Refactor the kit system so that **commands** are the primary primitive kits expose. Each kit provides a set of commands. A command is a unit of functionality that:

1. **Is discoverable via search** — type "calc" and the Calculator command appears alongside files and apps
2. **Can be set to work with a hotkey** — e.g., `CmdOrCtrl+=` activates Calculator
3. **Can be set with a prefix that triggers it** — e.g., `= 2+3` activates Calculator with input `2+3`

Search results become explicitly typed: **Application**, **File**, or **Command**.

Agent tools (chat tools / `chat_tools()` / `invoke_chat_tool()`) are **removed** from the kit trait in this pass. They'll be re-added later as a separate, more considered surface.

## Requirements

### Commands

- A command has an **id**, **name**, **description**, **icon**, **mode**, and optional **default prefix** and **default hotkey**.
- Two command modes:
  - **`InputResults`** — activates a chip in the search bar, then the user types a query and sees results (e.g., Calculator, Clipboard History).
  - **`Execute`** — runs immediately when selected, no sub-search flow (e.g., Clear Clipboard, Toggle Dark Mode).

### Search Result Kinds

- Every search result has a **kind**: `Application`, `File`, `Directory`, or `Command`.
- Commands appear in search results alongside files and apps, ranked by fuzzy match on their name.

### Chip UX

- When a user selects an `InputResults` command, the search bar shows a **chip**: `[🧮 Calculator] ▸` followed by a free-text input.
- Typing a prefix followed by a space (e.g., `= `) auto-shifts into the chip style — the prefix is replaced by the chip and the remaining text becomes the input.
- **Escape** when a chip is active pops the chip (returns to main search). Single press, no layered clear.

### Kit Trait Changes

**Removed surfaces:**
- `search_trigger()` / `search(query)` — replaced by `commands()` / `search(command_id, query)`
- `shortcuts()` / `handle_shortcut()` — absorbed into commands
- `chat_tools()` / `invoke_chat_tool()` — removed entirely (deferred to a future pass)

**New trait shape:**
```rust
#[async_trait]
pub trait Kit: Send + Sync {
    fn manifest(&self) -> &KitManifest;
    async fn init(&self, ctx: &KitContext) -> Result<(), KitError> { Ok(()) }
    async fn shutdown(&self) -> Result<(), KitError> { Ok(()) }

    // ── Commands ────────────────────────────────────────────────
    fn commands(&self) -> Vec<CommandDef>;
    fn search(&self, command_id: &str, query: &str) -> Vec<KitResult> { vec![] }
    async fn execute(&self, command_id: &str) -> Result<CommandOutput, KitError> {
        Err(KitError::CommandNotFound(command_id.to_string()))
    }

    // ── App Window (unchanged) ──────────────────────────────────
    fn app_window(&self) -> Option<&AppWindowConfig> { None }
}
```

### New Types

```rust
pub struct CommandDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub icon: KitIcon,
    pub mode: CommandMode,
    pub default_prefix: Option<&'static str>,
    pub default_hotkey: Option<&'static str>,
}

pub enum CommandMode {
    InputResults,
    Execute,
}

pub enum CommandOutput {
    /// Command completed silently.
    Done,
    /// Command completed with a notification/message.
    Message(String),
}

pub enum ResultKind {
    Application,
    File,
    Directory,
    Command { kit_id: String, command_id: String, mode: CommandMode },
}
```

### Frontend State

```typescript
interface ActiveCommand {
    kitId: string;
    commandId: string;
    name: string;
    icon?: KitIcon;
}

// searchStore additions:
// activeCommand: ActiveCommand | null
// activateCommand(cmd: ActiveCommand): void
// deactivateCommand(): void
```

### IPC Changes

- `search_all(query)` — unchanged signature, but now returns `ResultKind` in each result
- New: `search_command(kit_id, command_id, query)` — search within an active command
- New: `execute_command(kit_id, command_id)` — run an Execute-mode command
- `KitAction::ActivateKit` → `KitAction::ActivateCommand { kit_id, command_id }`

## Removed Types

These are deleted as part of this refactor:

- `SearchTrigger` (Prefix/Keyword) — absorbed into `CommandDef.default_prefix`
- `KitShortcut` — absorbed into `CommandDef.default_hotkey`
- `ShortcutAction` — replaced by `CommandOutput`
- `ChatToolDef` — removed (deferred)

## Implementation Plan

### Phase 1: Rust Command Types & Trait Refactor

1. **command-types**: Define `CommandDef`, `CommandMode`, `CommandOutput` in `kits/mod.rs`. Add `ResultKind` to `KitSearchResult`. Remove `SearchTrigger`, `KitShortcut`, `ShortcutAction`, `ChatToolDef`. `CommandMode` needs `Serialize`, `Deserialize`, `Clone`, `Debug` (it's embedded in `ResultKind` which crosses IPC).

2. **kit-trait-refactor**: Refactor `Kit` trait. Remove `search_trigger()`, `search(query)`, `shortcuts()`, `handle_shortcut()`, `chat_tools()`, `invoke_chat_tool()`. Add `commands()`, `search(command_id, query)`, `execute(command_id)`.

3. **calculator-migration**: Update `CalculatorKit` to new trait. One command: `calculate` (InputResults, prefix `=`). `search()` now takes `command_id`. Remove chat tool impl. Adapt all tests.

### Phase 2: Registry & Search Pipeline

4. **registry-refactor**: Refactor `KitRegistry` — index commands instead of search triggers. Build prefix index + command discovery index. `discovery_results()` returns individual commands (not kits) — a kit with N commands produces N discoverable results, each with `ResultKind::Command`. Replace `search()` with `search_command()` and `execute_command()`. Remove `chat_tool_index` and `all_chat_tools()` and `invoke_chat_tool()`. Update `kit_infos()` to expose commands instead of the old `trigger: Option<String>` field. Adapt existing registry tests.

5. **chat-pipeline-cleanup**: Strip tool calling from the Copilot provider (`providers/copilot/mod.rs`). Remove `build_tools_array()`, `find_kit_for_tool()`, and the tool dispatch loop in `send_message()`. The chat pipeline goes back to text-only streaming (send messages, stream SSE tokens, no tool rounds). Remove `chat:tool-start` / `chat:tool-done` event emissions. Adapt existing chat tests.

6. **search-all-refactor**: Update `search_all` IPC command — return files/apps/commands with `ResultKind`. Prefix detection: if query matches a command prefix, auto-route to that command's search. Add `search_command` and `execute_command` IPC commands. Note: both backend and frontend perform prefix detection (backend handles the instant before the chip activates; frontend manages chip state). Prefix matching rules must stay in sync — see step 9. Adapt existing search tests.

7. **ipc-types-update**: Update `KitSearchResult` to include `kind: ResultKind`. Update frontend TS types (add `ResultKind`, `ActiveCommand`; update `KitAction` — replace `ActivateKit` with `ActivateCommand { kitId, commandId }`). Update `KitInfo` TS type to reflect command-based structure.

### Phase 3: Frontend State & Routing

8. **search-store-update**: Add `activeCommand` to search store with `activateCommand()` / `deactivateCommand()`. `useSearch` routes to `search_command` IPC when command is active. Adapt existing search store tests.

9. **search-bar-chip**: Chip rendering in SearchBar — `[icon Name] ▸` before the input when `activeCommand` is set. Adapt existing SearchBar tests.

10. **prefix-detection**: Detect prefix + space in query → auto-activate command, strip prefix, show chip. Prefix matching must use the same rules as backend (step 6) — extract a shared prefix list from `search_all` or `get_kit_manifests` at startup.

11. **escape-chip**: Escape pops chip when `activeCommand` is set. Normal escape layering when no command active.

### Phase 4: Result Rendering & Actions

12. **result-kind-rendering**: `CoreSearchResult` uses `ResultKind` for icon/styling. New `CommandResult` component for command discovery rows. Adapt existing result rendering tests.

13. **command-actions**: Result selection: `InputResults` command → `activateCommand()`. `Execute` command → `execute_command` IPC. Handle `ActivateCommand` action type. Update `executeAction()` in `ResultsList.tsx` — replace `ActivateKit` handler (which sets query to prefix) with `ActivateCommand` handler (which activates chip via `activateCommand()`). Adapt existing action tests.

14. **register-command-component**: Register `CommandResult` in kit component registry.

### Phase 5: Tests

15. **rust-unit-tests**: CommandDef, CommandMode, ResultKind serialization. Registry command indexing, prefix lookup, discovery. search_command / execute_command dispatch.

16. **frontend-unit-tests**: activeCommand state, chip rendering, prefix auto-activation, Escape chip pop, command result actions.

### Dependencies

```
command-types → kit-trait-refactor → calculator-migration
kit-trait-refactor → registry-refactor → chat-pipeline-cleanup
registry-refactor → search-all-refactor → ipc-types-update
ipc-types-update → search-store-update → search-bar-chip
ipc-types-update → search-store-update → prefix-detection
search-store-update → escape-chip
ipc-types-update → result-kind-rendering → command-actions → register-command-component
All implementation → rust-unit-tests, frontend-unit-tests
```

## Deferred

- **Agent tools / chat tools** — removed from kit trait now, re-added later as a separate surface with its own design pass.
- **Hotkey registration** — `default_hotkey` field is defined but global shortcut wiring comes later.
- **User-configurable prefixes/hotkeys** in Settings UI — `CommandDef` provides defaults; config overrides come later.
- **Chat tool re-integration** — chat pipeline is stripped to text-only in step 5. Tool calling will be re-added when agent tools get their own design pass.
