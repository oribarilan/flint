# Bigger Settings Panel

## Summary

Increase the settings window size (wider emphasis, a bit taller) and use the extra room wisely by consolidating fragmented sections.

## Window Size

Change `inner_size(600.0, 450.0)` → `inner_size(740.0, 510.0)` in `src-tauri/src/window.rs`. Fixed, non-resizable. 23% wider, 13% taller.

## Layout Changes

### GeneralSettings (`src/components/settings/GeneralSettings.tsx`)

Consolidate 4 section cards into 2:

**Before:**
- Keyboard (1 row: hotkey display)
- Startup (1 row: launch at login toggle)
- Theme (1 row: segmented control)
- Appearance (2 rows: font size, backdrop blur)

**After:**
- **Behavior** — hotkey (with sublabel "Opens Flint from anywhere") + launch at login (with sublabel "Start Flint when you log in")
- **Appearance** — color theme + font size + backdrop blur (keeps existing sublabel)

### SearchSettings (`src/components/settings/SearchSettings.tsx`)

Merge the standalone "Depth" section (single row: max directory depth) into the "Indexed Directories" section as a row below the directory list. They're directly related — depth controls how deep those directories are indexed.

## Non-Changes

- **Sidebar (180px):** Already good.
- **Content padding (32px):** Already generous per design spec. Extra width flows to content naturally.
- **CSS files:** No changes — flex layout adapts automatically.
- **Chat & Kits pages:** Benefit from wider window without code changes.
