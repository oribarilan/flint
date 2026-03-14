# Explore: Animations

## Summary

Investigate animation opportunities for Flint's UI — window show/hide transitions, mode switching, result list changes, and chat panel interactions. Determine whether to stay with pure CSS or adopt a library, and define motion principles that fit the launcher's "instant, unobtrusive" character.

## Context

### What exists today

- **Design tokens**: `--transition-fast` (150ms) and `--transition-normal` (250ms) in `global.css`.
- **CSS transitions**: Hover/focus feedback on search bar icon, result items, settings toggles, buttons, selects.
- **Keyframe animations**: Launcher mount fade-in + scale (0.96→1.0), spinner rotation, pulse for loading/auth states.
- **Window show/hide**: Instant `win.show()` / `win.hide()` via Tauri — no easing or duration.
- **No animation libraries** — everything is pure CSS.
- **spec.md** has no explicit motion requirements.

### What's missing / could be explored

| Area | Current | Opportunity |
|------|---------|-------------|
| **Window appear/dismiss** | Instant show/hide | Fade + subtle scale on show; fade-out on hide. Needs Rust-side opacity stepping or CSS-driven with a delay before `hide()`. |
| **Mode switching** (Search ↔ Chat) | Icon swap + background color change, no transition | Crossfade or slide transition between modes. |
| **Result list updates** | Items pop in/out instantly | Staggered fade-in for results; exit animation for removed items. |
| **Chat messages** | Appear instantly | Fade/slide-in for new messages; typing indicator animation. |
| **Chip enter/exit** (Kit commands) | Instant | Slide-in from left; slide-out on dismiss. |
| **Settings window** | Instant open | Fade-in, or match main window animation. |
| **Error/empty states** | Static | Subtle entrance animation for empty-state illustrations. |

## Questions to answer

1. **Motion principles** — What should Flint's motion feel like? Suggestions: fast (≤200ms), purposeful (only animate meaningful state changes), non-blocking (never delay user input).
2. **Library vs. pure CSS** — Is pure CSS + `@keyframes` sufficient, or do we need layout animations (e.g., list reordering) that benefit from framer-motion / react-spring? Trade-off: bundle size vs. capability.
3. **Window-level animations** — Tauri's `show()`/`hide()` is instant. Options:
   - CSS animation on mount + `setTimeout` before `hide()` to allow exit animation.
   - Rust-side opacity stepping via `set_alpha()` (platform-dependent).
   - Accept instant show/hide and only animate *content* within the window.
4. **Reduced motion** — Should we respect `prefers-reduced-motion`? (Probably yes — wrap all animations in a media query.)
5. **Performance** — Animations must never cause dropped frames on the overlay. Stick to `transform` and `opacity` (GPU-composited properties). No layout-triggering animations.

## Approach

This is an **exploration task** — the output should be a decision document, not code. Steps:

1. Prototype 2–3 key animations in a branch (window appear, mode switch, result list).
2. Test perceived latency — does animation make the launcher feel faster or slower?
3. Evaluate pure CSS vs. framer-motion for the result list case.
4. Write up findings and propose a minimal animation spec to add to `spec.md`.
