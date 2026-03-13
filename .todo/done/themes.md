# Hot-Swappable Color Themes

## Summary

Add multiple color themes to Flint that users can switch between instantly from the Appearance settings. Themes are pure CSS token overrides — every component already consumes `var(--*)` tokens, so swapping a theme just means swapping the `:root` custom property values.

## Context

The design system (`src/styles/global.css`) defines all visual tokens as CSS custom properties. Every component CSS module uses `var(--bg-*)`, `var(--text-*)`, `var(--accent)`, etc. — zero hardcoded colors. This means adding themes requires no component changes, only new token value sets.

The existing `data-font-size` attribute pattern on `<html>` is the proven mechanism for live-swapping presets. Themes will follow the same approach: a `data-theme` attribute on `<html>` selects which token set is active.

Current stack involved:
- **`src/styles/global.css`** — design tokens (`:root` defaults)
- **`src/lib/applyTheme.ts`** — currently only has `applyFontSize()`
- **`src-tauri/src/config.rs`** — `AppearanceConfig` (currently only `font_size: String`)
- **`src/components/settings/AppearanceSettings.tsx`** — Appearance settings page
- **`src/hooks/useConfig.ts`** — config hook for loading/persisting
- **`src/main.tsx`** — bootstraps font size on load

## Themes to Implement

### 1. Flint (default — the existing dark theme)
Keep the current indigo accent glassmorphism palette as the default. Assign it `data-theme="flint"`.

### 2. Tokyo Night
Inspired by the tokyo-night color scheme. Dark blue-tinted backgrounds, soft purple/blue accents.
- Backgrounds: deep navy (`#1a1b26`, `#24283b`, `#414868`)
- Text: `#c0caf5` (primary), `#565f89` (secondary)
- Accent: `#7aa2f7` (blue) or `#bb9af7` (purple)
- Success/error/warning from the tokyo-night palette

### 3. Catppuccin Mocha
The "Mocha" flavor of Catppuccin — warm dark with pastel accents.
- Backgrounds: `#1e1e2e` (base), `#313244` (surface0), `#45475a` (surface1)
- Text: `#cdd6f4` (text), `#a6adc8` (subtext0)
- Accent: `#cba6f7` (mauve) or `#89b4fa` (blue)
- Full semantic set: green (success), red (error), yellow (warning)

### 4. Rosé Pine
Muted, elegant palette with warm undertones.
- Backgrounds: `#191724` (base), `#1f1d2e` (surface), `#26233a` (overlay)
- Text: `#e0def4` (text), `#908caa` (subtle)
- Accent: `#c4a7e7` (iris) or `#ebbcba` (rose)

### 5. Gruvbox Dark
Retro warm palette with earthy tones.
- Backgrounds: `#282828` (bg), `#3c3836` (bg1), `#504945` (bg2)
- Text: `#ebdbb2` (fg), `#a89984` (gray)
- Accent: `#fe8019` (orange) or `#fabd2f` (yellow)

*(More themes can be added later following the same pattern — each is just a CSS rule block.)*

## Implementation Plan

### Step 1: Theme definitions in CSS

Create `src/styles/themes.css` (imported by `global.css` or `main.tsx`). Structure:

```css
/* Flint (default) — values already in :root, but explicit for clarity */
html[data-theme="flint"], :root {
  --bg-primary: rgba(20, 20, 25, 0.85);
  /* ... existing values ... */
}

html[data-theme="tokyonight"] {
  --bg-primary: rgba(26, 27, 38, 0.85);
  /* ... overrides ... */
}

html[data-theme="catppuccin"] {
  --bg-primary: rgba(30, 30, 46, 0.85);
  /* ... overrides ... */
}

/* etc. */
```

Each theme block overrides **only the color tokens** (backgrounds, text, accent, semantic, borders, scrollbar, shadows). Spacing, radii, fonts, and transitions stay in `:root` and are theme-agnostic.

Glassmorphism: maintain `rgba()` semi-transparent backgrounds for all themes so the frosted-glass effect works across themes. Derive the rgba values from each theme's base colors.

### Step 2: Theme application function

Extend `src/lib/applyTheme.ts`:

```typescript
export function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
}
```

### Step 3: Rust config

Add `theme: String` to `AppearanceConfig` in `src-tauri/src/config.rs`:

```rust
pub struct AppearanceConfig {
    pub font_size: String,
    pub theme: String,  // "flint" | "tokyonight" | "catppuccin" | "rosepine" | "gruvbox"
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            font_size: "small".to_owned(),
            theme: "flint".to_owned(),
        }
    }
}
```

This is a non-breaking change — existing `config.toml` files that lack the key will get the default `"flint"`.

### Step 4: Bootstrap on load

In `src/main.tsx`, call `applyTheme(cfg.appearance.theme)` alongside `applyFontSize(cfg.appearance.font_size)`.

### Step 5: Settings UI — theme picker

In `AppearanceSettings.tsx`, add a theme selector above (or alongside) the font size control. Options:
- A grid of theme swatches showing name + small color preview (accent + bg + text)
- Or a segmented control / dropdown — whatever fits the current settings layout

Selecting a theme should:
1. Call `applyTheme(theme)` immediately (instant visual feedback)
2. Persist via `onUpdate({ ...config, appearance: { ...config.appearance, theme } })`

### Step 6: Apply to both windows

Both the main launcher window and the settings window load via `main.tsx`. The bootstrap code already runs for both, so both windows will pick up the theme from config on load.

For live cross-window sync: when the theme is changed in the settings window, the main launcher window should also update. Options:
- Tauri event system (`emit`/`listen`) to broadcast a `theme-changed` event
- Or re-read config on window focus

### Step 7: Tests

- **Rust unit tests**: `AppearanceConfig` serde round-trip with the new `theme` field, default value, backward compat with existing TOML.
- **Frontend unit tests**: `applyTheme()` sets `data-theme` attribute correctly. `AppearanceSettings` renders theme options and calls handler.

## Design Considerations

- **Glassmorphism across themes**: All themes should use semi-transparent backgrounds (`rgba`) to preserve the frosted glass look. Don't use fully opaque backgrounds.
- **Shadow colors**: Adjust shadow tokens per theme — dark themes need darker shadows, slightly tinted themes need tinted shadows.
- **Border colors**: Each theme should define border tokens that complement its palette.
- **Scrollbar colors**: Theme the scrollbar thumb to match the theme's secondary colors.
- **Accent contrast**: Ensure accent colors have sufficient contrast against backgrounds for accessibility.
- **No light themes for now**: All themes are dark variants. Light mode is a separate feature.

## Out of Scope

- Light mode / auto system theme detection — separate task
- User-defined custom themes (color picker) — future
- Per-window theme (all windows share the same theme)
- Theme preview tooltip on hover — nice-to-have, not required
