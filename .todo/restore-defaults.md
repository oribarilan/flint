# Restore to Defaults

## Summary

Add a "Restore to Defaults" capability for editable configuration sections. Users should be able to reset individual settings sections (Search, General, Appearance, Chat) back to their compile-time defaults without manually undoing each change.

## Context

The config system (`src-tauri/src/config.rs`) already has well-defined `Default` impls for every config struct:

- `GeneralConfig::default()` → hotkey `CmdOrCtrl+Shift+Space`, launch_at_login `false`
- `AppearanceConfig::default()` → font_size `"small"`
- `SearchConfig::default()` → `~/Desktop`, `~/Documents`, `~/Downloads` (+ `/Applications` on macOS), standard excludes, max_depth `6`
- `ChatConfig::default()` → default_model `"gpt-4.1"`

The persistence flow is: UI → `updateConfig()` IPC → `AppConfig::update()` → `save_to_disk()`. A reset is just calling `update` with the default values for that section.

### Current stack involved

- **`src-tauri/src/config.rs`** — `FlintConfig`, section structs, `Default` impls
- **`src-tauri/src/commands.rs`** — IPC command handlers (`get_config`, `update_config`)
- **`src-tauri/src/lib.rs`** — command registration in `invoke_handler`
- **`src/lib/commands.ts`** — TypeScript IPC wrappers
- **`src/hooks/useConfig.ts`** — `useConfig()` hook
- **`src/components/settings/*.tsx`** — individual settings pages

## Implementation Plan

### Approach A: Section-level reset (recommended)

Each settings page gets a "Restore Defaults" button that resets only that section. This is safer and more intuitive — users typically want to reset search config without losing their chat model preference.

#### Step 1: Rust — add a `get_default_config` command

```rust
#[tauri::command]
pub fn get_default_config() -> FlintConfig {
    FlintConfig::default()
}
```

Expose the defaults to the frontend so it can construct a partial reset. This avoids duplicating default values in TypeScript.

Register in `lib.rs` invoke_handler.

#### Step 2: TypeScript — add IPC wrapper

```typescript
export async function getDefaultConfig(): Promise<FlintConfig> {
  return invoke("get_default_config");
}
```

#### Step 3: useConfig hook — add `resetSection` helper

```typescript
const resetSection = useCallback(async (section: keyof FlintConfig) => {
  const defaults = await getDefaultConfig();
  const updated = { ...config, [section]: defaults[section] };
  await updateConfig(updated);
  setConfig(updated);
}, [config]);
```

#### Step 4: Settings UI — add button to each page

Add a "Restore Defaults" button at the bottom of each settings page. On click:

1. Show a brief confirmation (inline or small modal): "Reset search settings to defaults?"
2. On confirm, call `resetSection("search")` (or whichever section)
3. Apply any side-effects (e.g., `applyFontSize()` if resetting appearance)

Style the button subtly — secondary/ghost style, not prominent. It's a safety valve, not a primary action.

#### Step 5: Side-effects on reset

- **Appearance reset**: call `applyFontSize(defaults.appearance.font_size)` (and `applyTheme()` once themes land)
- **Search reset**: the indexer should re-index if directories changed — emit a Tauri event or call the reindex command
- **General reset**: hotkey change requires re-registering the shortcut

#### Step 6: Tests

- **Rust**: `get_default_config` returns correct defaults, round-trip serde
- **Frontend**: reset button renders, calls correct handler, confirmation flow works

### Approach B: Full reset (optional, lower priority)

A "Reset All Settings" button in the sidebar or at the bottom of the settings window. Calls `updateConfig(FlintConfig::default())`. Nice to have but less useful than per-section resets.

## Design Considerations

- Confirmation is important — accidental reset of search directories would require re-adding them
- The button should not be visually dominant; place it at the section footer
- After reset, the UI should reflect the new defaults immediately (optimistic update)
- Consider disabling the button when the section already matches defaults (nice-to-have)

## Out of Scope

- Undo/redo for config changes (separate feature)
- Config import/export
- Config versioning or migration
