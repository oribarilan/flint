# Pill Container

## Context

Replace Flint's fixed 340×480 rectangular overlay with a morphing pill shape. The pill animates its width, height, and border-radius based on the current view state. This task keeps all existing content and behavior — purely a visual container change.

**Value delivered**: The overlay looks and feels like a dynamic island instead of a static rectangle. Validates the transparent-window + CSS-pill approach before the block system adds complexity.

## Related Files

- `src/main/window/overlay.ts` — window dimensions (340×480 → 360×600)
- `src/renderer/src/App.tsx` — root layout
- `src/renderer/src/App.module.css` — fixed-width root container
- `src/renderer/src/styles/global.css` — design tokens

## Dependencies

- None (first task in the story)

## Acceptance Criteria

- [ ] Overlay window size increased to 360×600 in `overlay.ts`
- [ ] Window background fully transparent; pill is a CSS-rendered shape inside it
- [ ] Pill morphs width and border-radius based on current view:
  - Briefing: 320px width, 28px radius
  - Chat: 340px width, 22px radius
- [ ] Height is content-driven (`height: auto`), scrolls internally at max ~540px (`overflow-y: auto`, `overscroll-behavior: contain`)
- [ ] Morph animation: 450ms, `cubic-bezier(0.16, 1, 0.3, 1)` on width and border-radius
- [ ] Content transitions: fade out 150ms (ease-in), fade in 250ms with 8px translateY (ease-out-quart)
- [ ] `prefers-reduced-motion` collapses all animation durations to 0.01ms
- [ ] Click-through works on transparent areas outside the pill (spike first; if unreliable, implement dynamic window resize fallback)
- [ ] Pill shadow and border use existing design tokens (`--shadow-window`, `--glass-border`, etc.)
- [ ] Overlay positioning logic in `positionOnActiveDisplay()` updated for new window dimensions
- [ ] Existing unit and e2e tests pass (`just test`)
- [ ] Overlay-ready path performance unchanged: no new async work on show

## Verification

- **Automated**: `just test` passes, `just typecheck` passes
- **Ad-hoc**: `just dev` → summon overlay → verify pill shape, animations, and content rendering
- **Ad-hoc**: Click areas outside the pill on macOS → verify clicks pass through to windows below
- **Ad-hoc**: Toggle "Reduce motion" in macOS System Settings → verify instant transitions
- **Ad-hoc**: Send a message from briefing → verify pill morphs to chat width/radius smoothly

## Notes

- **Start with a click-through spike.** Test `setIgnoreMouseEvents(true, { forward: true })` on macOS with CSS `pointer-events: none` on the transparent wrapper, `pointer-events: auto` on the pill. If results are unreliable (shadow areas intercepting clicks, hover not forwarding correctly), fall back to dynamically resizing the BrowserWindow to match pill dimensions via `win.setSize()`.
- Only two pill states in this task (briefing and chat). Meeting-focus and action-confirm states come in task 3 when the corresponding blocks exist.
- Use CSS transitions on the pill container element. Set `will-change: width, border-radius` for GPU compositing. Avoid animating `height` directly — let it be content-driven and animate `max-height` or use a `ResizeObserver` + `requestAnimationFrame` if smooth height transitions are needed.
- The pill shadow extends beyond the pill bounds — ensure the transparent window has enough padding so the shadow isn't clipped.
- The pill should be centered horizontally within the 360px window. Vertical alignment: top-aligned (anchored to tray), with padding.
