# US-menubar-popover

## Goal

Replace Flint's centered overlay window (1032×520, split panel) with a menubar-anchored popover that drops from the top right. The popover proactively briefs the user on their day and provides chat access in a compact, frosted glass panel.

## Design Reference

`showcases/menubar-popover-showcase.html` — interactive mockup with the validated direction. Glass variant, dark theme is the target.

### Design Decisions

- **Form factor**: ~340px wide popover anchored to the tray icon, top right. Replaces the centered overlay.
- **Content model**: Proactive briefing first — time-based greeting with day context, then compact meeting rows, then attention items. Chat input always visible at bottom.
- **Visual treatment**: Frosted glass — `backdrop-filter: blur(60px) saturate(200%)`, semi-transparent dark surface, desktop bleeds through.
- **Density**: Compact — 12–13px body, 18px greeting, tight spacing, borderless rows.
- **Imminent meetings**: Accent styling with Join button.
- **Dismiss behavior**: Click outside closes the popover via blur event.

## Definition of Done

- [x] Tray icon click or global hotkey opens/closes a popover anchored below the tray icon, top-right — **Note**: tray click shows context menu only (user-requested change); hotkey and "Show Flint" menu item toggle the overlay
- [x] Popover shows: greeting → context summary → meeting rows → attention rows → chat input
- [x] Panel uses frosted glass treatment (backdrop-filter blur, transparent background, desktop visible)
- [x] Meeting data and chat work identically to the current overlay
- [x] Click outside the popover dismisses it
- [x] Light and dark themes both work
- [x] `just check` passes

## Task Priority

Sequential — each builds on the previous.

1. `1-popover-window.md` — ✅ Done
2. `2-popover-layout.md` — ✅ Done
3. `3-glass-treatment.md` — ✅ Done

## Cross-Cutting Concerns

**Design spec.** Window behavior, layout, and visual treatment changed. `specs/design.md` needs updating — flagged for review, not modified directly during implementation.

**IPC contract unchanged.** All existing channels preserved. New channels added for spotlight and settings features built alongside this story.

**Stores reused.** `attentionStore` and `chatStore` consumed as-is by new components.

**Performance.** Overlay-ready path remains zero-overhead — no network calls on open, meetings rendered from cache.

**Additional features built in this session** (beyond original story scope):
- Standalone Settings window with Menubar tab (tray icon toggle, event display config, spotlight config)
- Configurable menubar event display (tray title with time/title axes)
- Meeting Spotlight (fullscreen glass overlay before meetings)
- Active display positioning for all windows
- SegmentedControl replacing native selects in Settings
