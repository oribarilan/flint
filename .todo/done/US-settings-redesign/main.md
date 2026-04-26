# US-settings-redesign

## Goal

Replace the current 340px settings modal with a full-window sidebar-tabbed settings experience. Settings takes over the entire overlay window (replacing attention panel + chat) with a left sidebar navigation and a scrollable content area. Four category tabs: General, AI & Models, Notifications, Appearance.

## Definition of Done

- [ ] Opening settings (gear icon or `Cmd+,`) replaces the main view with a full-window settings layout (sidebar + content)
- [ ] Sidebar has 4 tabs (General, AI & Models, Notifications, Appearance) with icons, active tab has left accent border + accent-subtle background
- [ ] Each tab renders its correct settings controls with proper read/write via `useConfig`
- [ ] ESC or `Cmd+,` exits settings and returns to the main view
- [ ] All settings from `FlintConfig` are exposed in the UI (including `pollEnabled`, `pollFrequency`, `pollModel`)
- [ ] Appearance tab has theme segmented control (Light option disabled with "Coming soon") and font size segmented control (XS/S/M/L) that applies `data-font-size` to `<html>`
- [ ] Renderer-side `FlintConfig` type imports from shared location (no stale local copy)
- [ ] All components use design tokens exclusively — no hardcoded colors, spacing, or sizes
- [ ] Keyboard accessible: `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected`, focus management
- [ ] Unit tests for the Settings component and tab switching
- [ ] `just check` passes

## Task Priority

1. `shared-config-types.md` — Fix type drift first. Small, unblocks everything else cleanly.
2. `settings-layout.md` — Core layout: sidebar nav, tab switching, full-window takeover. The structural foundation.
3. `settings-tabs-content.md` — Wire up all 4 tabs with their actual controls and config read/write.
4. `font-size-setting.md` — New feature: font size segmented control that applies `data-font-size` attribute.

## Cross-Cutting Concerns

- **Full-window takeover**: `App.tsx` conditionally renders either the main split view (attention + chat) or the Settings component. Not a modal overlay — a view swap. No `role="dialog"`, no backdrop, no close button.
- **Escape stack**: Settings is now a view, not a modal. ESC while settings is open closes settings (returns to main). The existing escape stack in App.tsx needs adjustment — no backdrop click dismissal needed.
- **useKeyboardNav**: When settings is the active view, keyboard nav (`Ctrl+h/j/k/l`, panel focus) must be disabled. Pass a `disabled` flag or early-return when `showSettings` is true.
- **Bottom bar hints**: The hotkey hints in the footer (`navigate`, `scroll`, `open`, `select`) don't apply in settings view. Hide or swap them when settings is active. Can be deferred to a follow-up if needed.
- **Config hook**: Continue using `useConfig` for all config reads/writes. Optimistic local updates + IPC sync to main process, same as today.
- **Type imports**: Follow the existing cross-process import pattern from `ipc.ts` — import `FlintConfig` from `src/main/types.ts` via relative path. No `src/shared/` directory needed.
- **config.ts getAll()**: When adding new fields to `FlintConfig`, the `getAll()` method in `config.ts` must also be updated — it manually maps each field from the store.
- **Section cards**: Settings within each tab are wrapped in `--bg-secondary` cards with `--border-subtle` and `--radius-md`, matching the showcase (Variant A).
- **SegmentedControl**: Extract as a reusable component — it appears 3 times (poll frequency, theme, font size).
- **Control types**: toggles (`role="switch"`), segmented controls, number inputs, read-only mono badges. All existing control styles from the current Settings component are reused/extracted.
- **Design reference**: Showcase at `showcases/settings-tabs-showcase.html` (Variant A) is the visual target.
