# Flint — Design Specification

This is the source of truth for Flint's visual identity, design tokens, and UI principles. All frontend implementation must follow this spec. If an implementation decision conflicts with this document, raise it rather than silently diverging.

## Identity: Spark × Strike

Flint's visual identity is a hybrid of two directions:

- **Spark** provides distinctiveness — icon containers, accent-tinted selection, two-line result layout, generous radii, and an opinionated empty state. These are the elements that make Flint recognizable in a screenshot.
- **Strike** provides confidence — structural borders where they earn their keep, decisive type weights, and a sense of precision. Nothing is tentative.

The synthesis: **a precision tool with personality.** Like the stone itself — sharp, fundamental, and capable of creating sparks.

### Signature Elements

These are the details that make Flint *Flint*. Don't dilute them.

1. **Icon containers** — Result icons sit inside rounded-square containers (30–32px, `--radius-md` corners). On selection, the container fills with accent color and the icon inverts to white. This is the single most distinctive visual element.
2. **Accent-tinted selection** — Selected items use a subtle accent-colored background (`--accent` at ~10% opacity), not a generic gray. This makes selection feel intentional, not accidental.
3. **Two-line result layout** — File name above path, stacked vertically. More scannable than inline layout, and gives the icon containers room to breathe.
4. **Structural search divider** — A visible border below the search bar separates input from results. This is Strike's contribution — it creates a clear zone hierarchy.
5. **Accent-tinted chat bar** — In chat mode, the input row has a subtle accent wash to signal mode change without being jarring.
6. **Guided empty states** — Empty states are not blank. They include guiding copy and, where appropriate, suggestion chips. The app has a voice.

## Typography

### Font

**DM Sans** — geometric, clean, precise. Distinctive enough to not feel generic (unlike Inter/Roboto), quiet enough to not compete with the Spark elements for attention.

```css
--font-sans: 'DM Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
```

Monospace unchanged:

```css
--font-mono: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", Menlo, Consolas, monospace;
```

DM Sans must be bundled with the app (not loaded from Google Fonts) to avoid FOUT and network dependency.

### Type Scale

All sizes in `rem` to respect user browser preferences. The scale uses a ~1.2 (minor third) ratio with practical rounding.

| Token | Default | rem | Use |
|-------|---------|-----|-----|
| `--font-xs` | 10px | 0.625rem | Hint labels, badges |
| `--font-sm` | 11px | 0.6875rem | Secondary UI, metadata, paths |
| `--font-base` | 12px | 0.75rem | Body text, labels |
| `--font-md` | 13px | 0.8125rem | Result names, input fields |
| `--font-lg` | 16px | 1rem | Section headings, search input |
| `--font-xl` | 20px | 1.25rem | Page titles |

Note: `1rem = 16px` at browser default. Flint sets its own root font size, so `rem` values are relative to the browser base, not Flint's `--font-base`.

### Type Weights

Use weight variation deliberately — it's a hierarchy tool, not decoration.

| Weight | Use |
|--------|-----|
| 400 (Regular) | Body text, secondary labels, assistant messages |
| 500 (Medium) | Result names, input text, active labels |
| 600 (Semibold) | Section titles, selected states, emphasis |
| 700 (Bold) | Page titles only |

### Line Height

- Body text and results: `1.5`
- Headings: `1.2`
- Chat messages: `1.6` (more breathing room on dark backgrounds)
- Small text (xs, sm): `1.5`

### Section Titles

Section titles should be **larger or equal** to body text, not smaller. Use weight (600) + `text-transform: uppercase` + `letter-spacing: 0.05em` + muted color for hierarchy — not reduced size.

## Color System

### Philosophy

- **OKLCH** for all color definitions — perceptually uniform, predictable lightness scaling.
- **Tinted neutrals** — no pure gray. All neutrals carry a subtle hue tint (chroma 0.005–0.01) that creates subconscious cohesion with the accent color.
- **No pure black, no pure white** — use near-black and near-white with subtle tint.
- **Semantic tokens only** in component CSS — never raw OKLCH/hex/rgba values.
- **Alpha sparingly** — explicit colors over transparency. Alpha only for overlay states (hover, selection tint) where see-through is the intent.

### Brand Palette

Fixed colors for Flint's identity — icon, landing page, marketing, favicon. These never change. The amber hue family (60–68°) references flint's fire: warm, distinctive, not-AI-purple.

| Name | Value | Role |
|------|-------|------|
| **Flint Amber** | `oklch(72% 0.17 65)` | Primary brand. Icon bg, CTAs, hero accents. |
| **Flint Ember** | `oklch(55% 0.14 60)` | Dark variant. Text on light bg, pressed states. |
| **Flint Glow** | `oklch(88% 0.08 68)` | Light tint. Subtle backgrounds, hover washes. |
| **Flint Charcoal** | `oklch(15% 0.01 60)` | Dark surface. Dark mode bg, icon dark variant. |
| **Flint Cream** | `oklch(97% 0.005 65)` | Light surface. Light mode bg, landing page. |
| **Flint Stone** | `oklch(93% 0.006 60)` | Warm gray. Borders, secondary bg on light. |

### Accent Color

The accent color is derived from the brand palette and appears in: selected icon containers, user chat bubbles, the search icon on focus, selection tint backgrounds, active UI elements, and the chat bar wash.

The accent adapts per theme for optimal contrast:
- **Dark theme**: `oklch(74% 0.15 65)` — brightened for visibility on dark backgrounds. Dark text on accent.
- **Light theme**: `oklch(58% 0.15 60)` — darkened for contrast on light backgrounds. White text on accent.

### Core Themes

Flint ships with two built-in themes: **Flint Dark** (default) and **Flint Light**.

Community themes (Tokyo Night, Catppuccin, etc.) are removed for now. They can return as a plugin/import system later, but the core themes must be excellent first.

#### Token Structure

Every theme defines the same set of semantic tokens. Component CSS only references these tokens — never theme-specific values.

**Background tokens:**
| Token | Purpose |
|-------|---------|
| `--bg-primary` | Main surface (launcher body, settings background) |
| `--bg-secondary` | Elevated surfaces (cards, sections, chat assistant bubbles) |
| `--bg-hover` | Hover state for interactive elements |
| `--bg-selected` | Selection state (non-accent, for neutral contexts) |
| `--bg-solid` | Opaque version of primary (for non-transparent windows like settings) |
| `--bg-accent-subtle` | Accent at ~8-10% opacity (selection tint, chat bar wash, active chips) |

**Text tokens:**
| Token | Purpose |
|-------|---------|
| `--text-primary` | Main text — high contrast, near-full opacity |
| `--text-secondary` | Supporting text — labels, hints, metadata. Must be ≥ 0.65 opacity equivalent |
| `--text-placeholder` | Placeholder text — must still meet WCAG AA (4.5:1 contrast) |
| `--text-on-accent` | Text on accent-colored backgrounds |

**Accent & semantic tokens:**
| Token | Purpose |
|-------|---------|
| `--accent` | Primary interactive color |
| `--accent-hover` | Accent on hover (slightly adjusted) |
| `--color-success` | Success states |
| `--color-error` | Error states |
| `--color-error-bg` | Error background (subtle) |
| `--color-warning` | Warning states |

**Border tokens:**
| Token | Purpose |
|-------|---------|
| `--border-subtle` | Default dividers, card outlines |
| `--border-hover` | Border on hover |
| `--border-active` | Border on focus/active |

**Shadow tokens:**
| Token | Purpose |
|-------|---------|
| `--shadow-lg` | Launcher/modal shadow |
| `--shadow-sm` | Buttons, small elevated elements |

#### Flint Dark

Default theme. Warm charcoal surfaces, amber accent brightened to L74% for pop. All neutrals tinted toward hue 60° for cohesion.

| Token | Value | Notes |
|-------|-------|-------|
| `--bg-primary` | `oklch(14% 0.006 60)` | Main surface |
| `--bg-secondary` | `oklch(19% 0.007 60)` | Elevated surfaces, icon containers |
| `--bg-hover` | `oklch(23% 0.008 60)` | Hover state |
| `--bg-selected` | `oklch(25% 0.01 60)` | Neutral selection (non-accent) |
| `--bg-solid` | `oklch(14% 0.006 60)` | Opaque (settings window) |
| `--bg-accent-subtle` | `oklch(74% 0.15 65 / 0.1)` | Selection tint, chat bar wash |
| `--text-primary` | `oklch(93% 0.006 60)` | Main text |
| `--text-secondary` | `oklch(62% 0.008 60)` | Labels, hints, metadata |
| `--text-placeholder` | `oklch(43% 0.006 60)` | Placeholder text |
| `--text-on-accent` | `oklch(16% 0.02 65)` | Dark text on amber accent |
| `--accent` | `oklch(74% 0.15 65)` | Primary interactive color |
| `--accent-hover` | `oklch(70% 0.14 65)` | Accent on hover |
| `--color-success` | `oklch(72% 0.15 145)` | Success states |
| `--color-error` | `oklch(65% 0.2 25)` | Error states |
| `--color-error-bg` | `oklch(65% 0.2 25 / 0.12)` | Error background |
| `--color-warning` | `oklch(78% 0.15 85)` | Warning states |
| `--border-subtle` | `oklch(23% 0.006 60)` | Dividers, card outlines |
| `--border-hover` | `oklch(28% 0.008 60)` | Border on hover |
| `--border-active` | `oklch(25% 0.007 60)` | Border on focus |
| `--shadow-lg` | `0 25px 60px oklch(4% 0.01 60 / 0.5)` | Launcher shadow |
| `--shadow-sm` | `0 1px 3px oklch(4% 0.01 60 / 0.3)` | Small element shadow |

#### Flint Light

Bright daytime theme. Warm cream surfaces, accent darkened to L58% for contrast. White text on accent.

| Token | Value | Notes |
|-------|-------|-------|
| `--bg-primary` | `oklch(98% 0.005 65)` | Main surface |
| `--bg-secondary` | `oklch(94% 0.008 65)` | Elevated surfaces, icon containers |
| `--bg-hover` | `oklch(91% 0.01 65)` | Hover state |
| `--bg-selected` | `oklch(89% 0.012 65)` | Neutral selection (non-accent) |
| `--bg-solid` | `oklch(98% 0.005 65)` | Opaque (settings window) |
| `--bg-accent-subtle` | `oklch(58% 0.15 60 / 0.08)` | Selection tint, chat bar wash |
| `--text-primary` | `oklch(21% 0.01 60)` | Main text |
| `--text-secondary` | `oklch(47% 0.01 60)` | Labels, hints, metadata |
| `--text-placeholder` | `oklch(63% 0.008 60)` | Placeholder text |
| `--text-on-accent` | `oklch(98% 0.005 60)` | White text on darkened accent |
| `--accent` | `oklch(58% 0.15 60)` | Primary interactive color |
| `--accent-hover` | `oklch(53% 0.14 60)` | Accent on hover |
| `--color-success` | `oklch(48% 0.14 150)` | Success states |
| `--color-error` | `oklch(52% 0.2 25)` | Error states |
| `--color-error-bg` | `oklch(52% 0.2 25 / 0.08)` | Error background |
| `--color-warning` | `oklch(55% 0.14 80)` | Warning states |
| `--border-subtle` | `oklch(88% 0.008 65)` | Dividers, card outlines |
| `--border-hover` | `oklch(82% 0.01 65)` | Border on hover |
| `--border-active` | `oklch(85% 0.009 65)` | Border on focus |
| `--shadow-lg` | `0 12px 28px oklch(50% 0.02 60 / 0.1)` | Launcher shadow |
| `--shadow-sm` | `0 1px 3px oklch(50% 0.02 60 / 0.06)` | Small element shadow |

### Contrast Requirements

All text must meet WCAG AA minimum contrast:

| Content | Minimum Ratio |
|---------|--------------|
| Body text | 4.5:1 |
| Large text (≥16px or ≥14px bold) | 3:1 |
| UI components, icons | 3:1 |
| Placeholder text | 4.5:1 |

## Spacing

4px base grid. Name tokens by relationship, not value.

| Token | Value | Use |
|-------|-------|-----|
| `--space-xs` | 4px | Tight gaps, inline padding |
| `--space-sm` | 8px | Default gap between siblings |
| `--space-md` | 12px | Section internal padding, result gaps |
| `--space-lg` | 16px | Card padding, generous gaps |
| `--space-xl` | 20px | Section spacing |
| `--space-2xl` | 24px | Page-level spacing |
| `--space-3xl` | 32px | Major section separation |

**Rules:**
- Use `gap` over margins for sibling spacing
- No hardcoded px values for spacing in component CSS — use tokens
- Exception: border widths (1px, 2px, 3px) do not need tokens

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 6px | Buttons, inputs, kbd badges, result items |
| `--radius-md` | 8px | Icon containers, cards, chat bubbles |
| `--radius-lg` | 12px | Launcher outer shell, modals |
| `--radius-full` | 9999px | Pills, chips, toggles |

Note: reduced from current 16px launcher radius to 12px — still generous (Spark), but tighter (Strike).

## Icons

### Result Icons

Result icons use **icon containers**: rounded squares with a background.

| Property | Value |
|----------|-------|
| Container size | 30px × 30px (`--icon-container`) |
| Container radius | `--radius-md` (8px) |
| Container bg (default) | `--bg-secondary` |
| Container bg (selected) | `--accent` |
| Icon size inside container | 16px |
| Icon color (default) | `--text-secondary` |
| Icon color (selected) | `--text-on-accent` |

### Utility Icons

Smaller icons (search, close, arrows) do NOT use containers:

| Token | Value | Use |
|-------|-------|-----|
| `--icon-sm` | 16px | Inline icons, hint icons |
| `--icon-md` | 18px | Search bar icon, action icons |
| `--icon-lg` | 24px | Settings page, large actions |

## Interaction States

Every interactive element must define all applicable states:

| State | Treatment |
|-------|-----------|
| **Default** | Base styling |
| **Hover** | Background shift (`--bg-hover`), NOT opacity change |
| **Focus-visible** | 2px outline in `--accent`, 2px offset. Applied via `:focus-visible` only |
| **Active/pressed** | Slight darkening or `scale(0.98)` transform |
| **Selected** | Accent-tinted background + icon container fill |
| **Disabled** | Reduced opacity (0.5), `pointer-events: none` |
| **Loading** | Spinner or skeleton — never blank |

**Rules:**
- Never use `opacity` for hover states — use actual color changes
- Never remove outline without a `:focus-visible` replacement
- Active/pressed states are required for all buttons
- All transitions use exponential easing: `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart)

## Motion

### Duration Scale

| Duration | Use |
|----------|-----|
| 80–120ms | Micro-feedback (hover, color change, press) |
| 150–200ms | State changes (selection, mode switch) |
| 250–350ms | Layout changes (panel show/hide, accordion) |

Exit animations at ~75% of enter duration.

### Easing

Default easing for all transitions:

```css
--ease-out: cubic-bezier(0.25, 1, 0.5, 1);   /* ease-out-quart — elements entering */
--ease-in: cubic-bezier(0.7, 0, 0.84, 0);     /* elements leaving */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); /* state toggles */
```

**Never use generic `ease`.** Never use bounce or elastic curves.

### Reduced Motion

Non-negotiable. All animations must respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Functional indicators (spinners, progress) should still work but without spatial movement — use opacity-only alternatives.

## Empty States

Empty states are onboarding moments, not dead ends.

| Context | Treatment |
|---------|-----------|
| Search (no query) | Guiding copy: "Type to search files, apps, and commands" |
| Search (no results) | Helpful copy: "No matches for [query]" with suggestion to adjust |
| Chat (no messages) | Welcome + suggested prompts or ghost text |
| Auth required | Warm explanation + clear CTA |
| Settings list (empty) | Explanation of what goes here + add action |

## Accessibility

- **All font sizes in `rem`** — respects browser zoom and user preferences
- **Focus-visible on all interactive elements** — 2px accent outline, 2px offset
- **ARIA roles** on all custom interactive components (listbox, option, dialog)
- **Keyboard navigation** — arrow keys within groups (roving tabindex), Tab between groups
- **`prefers-reduced-motion` respected** — see Motion section
- **Minimum 44px touch/click targets** — use padding or pseudo-elements if visual size is smaller
- **No `user-scalable=no`** — never disable zoom
- **`tabular-nums`** on numeric displays (countdowns, indices)

## Settings Design

The settings window follows the same identity principles but is a full-window experience (not an overlay).

**Key principles for settings:**
- Same structural language — icon containers where items have icons, accent-tinted active states
- Sidebar navigation with left accent border on active tab (from current design — this works)
- Section cards with subtle background elevation
- All interactive elements (toggles, selects, inputs) must have full 8-state coverage
- Generous whitespace — settings are read, not scanned at speed
- Reset/destructive actions visually distinct (ghost style, confirmation required)
