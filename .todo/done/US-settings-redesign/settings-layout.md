# settings-layout

## Context

Replace the current settings modal with a full-window sidebar-tabbed layout. When settings is open, the entire overlay window shows the settings view instead of the attention panel + chat. The sidebar has 4 labeled tabs with icons; clicking a tab shows its content panel on the right.

**Value delivered**: Settings is now a proper full-window experience with sidebar navigation, matching the design spec and ready for tab content to be wired up.

## Related Files

- `src/renderer/src/App.tsx` — view switching (main vs settings)
- `src/renderer/src/App.module.css` — layout styles
- `src/renderer/src/components/Settings.tsx` — complete rewrite
- `src/renderer/src/components/Settings.module.css` — complete rewrite
- `showcases/settings-tabs-showcase.html` — Variant A is the visual target

## Dependencies

- `shared-config-types.md` (should be done first so Settings imports the right type)

## Acceptance Criteria

- [ ] `App.tsx` renders Settings as a full-window view (not modal) when `showSettings` is true — the split body (attention + chat) is hidden
- [ ] Settings component has a 180px sidebar with "Settings" title and 4 nav items: General (sun icon), AI & Models (cpu icon), Notifications (bell icon), Appearance (contrast icon)
- [ ] Active tab has `--bg-accent-subtle` background and 3px left `--accent` border (rounded)
- [ ] Clicking a tab switches the content panel on the right; only one panel visible at a time
- [ ] Tab state is local `useState` inside Settings
- [ ] ESC exits settings (existing escape stack in App.tsx handles this — no backdrop click needed)
- [ ] `Cmd+,` / `Ctrl+,` toggles settings (already wired, just verify it works with the new layout)
- [ ] Sidebar tabs use `role="tablist"` / `role="tab"` with `aria-selected`; content panels use `role="tabpanel"` with `aria-labelledby`
- [ ] All styling uses design tokens from `global.css` — no hardcoded values
- [ ] Tab content areas show placeholder text (e.g., "General settings") — actual controls are wired in the next task
- [ ] Settings does NOT use `role="dialog"`, `aria-modal`, backdrop overlay, or close button — it's a view, not a modal
- [ ] When settings view is active, `useKeyboardNav` does not process keystrokes (no `Ctrl+h/j/k/l` navigation in settings)
- [ ] Unit test: Settings renders, tab switching works, correct panel shown for each tab
- [ ] `just check` passes

## Verification

- **Automated**: Unit test for Settings component — renders sidebar, switches tabs, shows correct panel
- **Ad-hoc**: `just check` passes; visual inspection against showcase Variant A

## Notes

- Use Lucide React icons: `Sun` for General, `Cpu` for AI & Models, `Bell` for Notifications, `Contrast` for Appearance. Import directly since these are static/known at compile time.
- The footer/bottom bar should still be visible when settings is open (it's outside the main content area).
- Settings receives `config`, `onUpdate`, `onClose` props — same interface as today.
