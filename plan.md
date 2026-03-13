# Flint

An AI-native application launcher, built to feel fast and invisible. Flint hooks into your existing GitHub Copilot subscription so there's nothing extra to pay for — just authenticate and go.

## Implementation Plan

This is the execution plan derived from `spec.md`. Each phase is a shippable increment.

### Current State (what's built)

- ✅ Tauri v2 scaffold (React + TypeScript + Vite + Rust)
- ✅ Launcher overlay (borderless, transparent, always-on-top, hotkey toggle)
- ✅ System tray (Show Flint, Settings, Quit)
- ✅ File search (indexer + nucleo fuzzy matching + open on Enter)
- ✅ App icons (macOS .icns extraction)
- ✅ Copilot auth (device flow, keychain storage, token refresh)
- ✅ Chat streaming (SSE via reqwest, Tauri events)
- ✅ Settings window (separate window, auth UI)
- ✅ Test suite (88 tests: 42 Rust + 46 frontend)

### Phase A — Mode Switching & Escape Layering

Implement the dual-mode UX from spec. This replaces the current `/ai` prefix approach.

**Rust**: No changes needed — backend is mode-agnostic.

**Frontend**:
1. **Tab toggle**: Add mode state to a new `appStore` (or extend searchStore). Tab key switches between `search` and `chat`. Remove `/ai` prefix detection.
2. **Visual indicator**: Search bar icon swaps (magnifying glass ↔ sparkle). Subtle background color change on the search bar wrapper in chat mode.
3. **Escape layering**: Refactor Escape handling in App.tsx:
   - Input has text → clear input
   - Chat session active → `clearChat()`, switch to search mode
   - Empty search mode → `hideWindow()`
4. **Chat session persistence**: Don't clear chat on window hide/show. Only clear on Escape layer 2.
5. **Tests**: Update SearchBar tests for Tab toggle. Add Escape layering integration tests.

### Phase B — Config File System

The backbone for all settings. Must exist before the Settings UI can write real values.

**Rust**:
1. **Config module** (`src-tauri/src/config.rs`):
   - `FlintConfig` struct with serde (derives Serialize, Deserialize, Default)
   - Sections: `GeneralConfig`, `SearchConfig`, `ChatConfig`
   - Load from `~/.config/flint/config.toml`, fall back to defaults
   - Save (write TOML back to file)
   - Watch file for external changes (notify crate), reload on change
   - Add `toml` crate to Cargo.toml
2. **IPC commands**: `get_config`, `update_config` (partial updates, merge with existing)
3. **Wire into indexer**: Read `search.directories` and `search.exclude` from config instead of hardcoded constants
4. **Wire into hotkey**: Read `general.hotkey` from config
5. **Tests**: Config round-trip (write → read → verify), default fallback, partial update merge

**Frontend**:
1. **`useConfig` hook**: Fetch config on mount, expose typed config + update function
2. **Wire into existing code**: No immediate UI changes — this is infrastructure

### Phase C — Settings UI Rebuild

Replace the current single-page Settings with the sidebar layout from spec.

**Frontend**:
1. **Settings layout**: Sidebar (General / Chat / Search) + content panel
2. **General page**: Launch at login toggle, hotkey display (read-only for now)
3. **Chat page**: Provider auth status (Connected/Not connected), sign in/out buttons, model dropdown
4. **Search page**: Indexed directories list (display only for now, edit later)
5. **Shared components**: Toggle, Select, SectionCard — reusable settings primitives
6. **Tests**: Settings renders correct page on sidebar click, auth status display

### Phase D — Chat Polish

Fix remaining chat issues and improve quality.

1. **Double-token bug**: Diagnose with `RUST_LOG=debug` output. Fix root cause (likely `emit` vs `emit_to`, or frontend listener duplication).
2. **Conversation context**: Send full message history to the API (not just the last message). The Rust command should accept the conversation or the store should manage it.
3. **Streaming UX**: Cursor/typing indicator while waiting for first token. Auto-scroll to bottom.
4. **Clear visual**: "New chat" indicator when session is reset.

### Phase E — Search Polish

1. **Config-driven directories**: Indexer reads from config file
2. **Re-index command**: Tray menu or settings button to trigger re-index
3. **Index stats**: Show count + last indexed time in Search settings
4. **Progressive results**: Start returning matches as user types (currently 2+ chars, could be 1)

### Future Phases (from spec, not yet planned in detail)

- **Full chat window**: Separate persistent window with markdown rendering, code blocks, copy
- **AI commands with confirmation**: Tool-calling, action cards
- **Intent auto-detection**: Heuristic or LLM-based mode switching
- **Additional providers**: OpenAI API key, Anthropic, etc.
- **Launch at login**: Platform autostart APIs
- **Auto-updates**: See `.todo/auto-updates.md`
