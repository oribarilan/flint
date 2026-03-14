# Implement: Animations

## Summary

Implement Flint's animation system based on decisions from the v3 animation showcase exploration. The guiding principle: animations must add fluidity without introducing lag. Pure CSS only — no libraries.

## Decisions

| Interaction | Animation | Style | Duration | Easing |
|---|---|---|---|---|
| Launcher entrance | **None** | Instant | — | — |
| Mode switch (Tab) | **None** | Instant | — | — |
| Selection highlight | **Slide** | `translateY` on a positioned highlight element | ~120ms | ease-out-quart |
| Chat messages | **Bloom** | `scale` entrance with stagger | ~150ms, ~50ms stagger | ease-out-quart |
| Button press | **Bloom** | `scale(0.95)` squish on press | ~120ms | ease-out-quart |
| Thinking dots | **Slide** | Bounce upward in sequence | 1s loop | ease-out-quart |
| Toggle thumb | **Slide** | Thumb slides left↔right | 160ms | ease-out-quart |
| Search bar spinner | **Remove** | Replaced by thinking dots in chat panel | — | — |

### Key design decisions

- **Unified easing**: All animations use `ease-out-quart` (`cubic-bezier(0.25, 1, 0.5, 1)`) — already defined as `--ease-out` token.
- **No animation on list items**: Selection highlight is a separate positioned element that slides between rows. List items themselves never animate — avoids cross-fade jitter on rapid arrow-key navigation.
- **Wrap-around slides**: When selection wraps from last→first, the highlight slides the full distance (no special-case instant jump). Simpler logic, visually continuous.
- **Spinner removal**: The search bar loading spinner is removed. In chat mode, thinking dots in the chat panel serve as the loading indicator. File search via nucleo is near-instant and doesn't need a spinner.
- **`prefers-reduced-motion`**: Already implemented globally in `global.css`. All new animations will be covered by the existing media query.
- **GPU-only properties**: Stick to `transform` and `opacity` — no layout-triggering animations.

## Implementation scope

### Changes needed

1. **ResultsList**: Refactor selection from per-item `.selected` background to an absolutely-positioned highlight `<div>` with `transition: top` on `--ease-out`.
2. **ChatPanel**: Add bloom (scale) entrance animation to new messages with stagger delay.
3. **SearchBar**: Remove the `spin` keyframe and spinner element. Remove associated loading spinner CSS.
4. **ChatPanel thinking indicator**: Replace `pulse` opacity animation with bouncing dots using `translateY`.
5. **Global tokens**: Add `--transition-slide: 120ms var(--ease-out)` token if not already covered by `--transition-fast`.
6. **Button/interactive states**: Add `scale(0.95)` active state animation to buttons and clickable elements.
7. **Settings toggles**: Already partially animated — verify toggle thumb uses the correct easing token.

### Files likely affected

- `src/components/ResultsList.tsx` + `ResultsList.module.css`
- `src/components/ChatPanel.tsx` + `ChatPanel.module.css`
- `src/components/SearchBar.tsx` + `SearchBar.module.css`
- `src/styles/global.css` (tokens)
- `src/components/Settings.module.css` (verify toggle)
- `src/components/AuthPrompt.module.css` (pulse → remove if unused)

## Context

- **Showcase file**: `animation-showcase.html` (v3) in repo root — interactive comparison used for decision-making.
- **Design spec motion section**: `specs/design.md` lines 305–342 defines duration scale, easing curves, and reduced-motion rules.
- **Existing tokens**: `--ease-out`, `--ease-in`, `--ease-in-out`, `--transition-fast` (120ms), `--transition-normal` (200ms) in `src/styles/global.css`.
