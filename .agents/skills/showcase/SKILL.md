---
name: showcase
description: Build interactive HTML showcases to compare design directions side-by-side. Use when making visual design decisions that benefit from seeing alternatives rendered, not described.
user-invokable: true
args:
  - name: topic
    description: What design decision to showcase (e.g., "settings layout", "color palette", "component variants")
    required: true
---

Build a standalone HTML showcase page for comparing design alternatives visually. This is a design decision tool — use it when words alone can't capture the difference between options.

## When to Use

- Choosing between visual directions (color palettes, layout structures, component styles)
- Evaluating how a design holds up across multiple contexts (dark/light, search/chat, empty/full)
- Getting user feedback on design alternatives before implementing

## Showcase Principles

1. **Same content, different treatment** — all variants show identical content so the structural/visual differences are isolated
2. **Side-by-side comparison** — grid layout with all options visible simultaneously, never sequential
3. **Per-scenario rows** — group by scenario (e.g., "Search Mode", "Chat Mode", "Empty State"), not by variant
4. **Include a recommendation** — always mark one option with a badge and explain why in 2-3 sentences
5. **Show real UI** — mock the actual app components (launcher, settings, etc.), not abstract swatches
6. **Use CSS custom properties** — parameterize themes/variants via `--t-*` variables so the launcher component code is written once and themed per-column
7. **Include trait chips** — short labels that name the key structural differences per variant

## File Structure

- Output: `{topic}-showcase.html` in the project root (gitignored dev artifact)
- Self-contained: inline CSS, no external dependencies except Google Fonts if needed
- Use the project's chosen font (DM Sans) loaded via Google Fonts CDN (showcase only — the app bundles it)

## HTML Structure Template

```
Page header (title + subtitle explaining what's being compared)
├── Recommendation card (if applicable)
├── Section: Scenario 1 (e.g., "Search Mode")
│   └── Grid: Variant A | Variant B | Variant C [| Variant D]
├── Section: Scenario 2 (e.g., "Chat Mode")
│   └── Grid: Variant A | Variant B | Variant C [| Variant D]
└── Section: Scenario 3 (e.g., "Empty State")
    └── Grid: Variant A | Variant B | Variant C [| Variant D]
```

## Styling Conventions

- Page background: `oklch(6-8% 0.008 260)` (dark showcase page)
- Section titles: uppercase, small, letter-spaced, muted
- Column headers: variant name + optional recommendation badge
- Trait chips: small pills below column headers listing key differences
- Launcher mocks: use `var(--t-*)` custom properties so one `.launcher` class works for all variants
- Grid: `grid-template-columns: repeat(N, 1fr)` where N = number of variants (usually 2-4)
- Responsive: collapse to 1-2 columns on narrow viewports

## Design Quality

Follow the project's design reference (`.agents/skills/frontend-design/reference/`):
- OKLCH for all colors
- Tinted neutrals (never pure gray)
- Exponential easing curves
- No bounce/elastic animations
- Typography: DM Sans, clear hierarchy via weight + size, not decoration

## After Building

1. Open the file in the browser: `open {file}.html`
2. Present the options with a recommendation
3. Wait for the user's choice before implementing
4. Delete or gitignore the showcase file before committing — it's a dev artifact, not part of the app
