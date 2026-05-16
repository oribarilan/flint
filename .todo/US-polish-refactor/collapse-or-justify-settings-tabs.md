# collapse-or-justify-settings-tabs

## Context

`src/renderer/src/components/Settings.tsx` is 324 LOC with 4 tabs (General, AI & Models, Notifications, Appearance). Each tab has 1–4 settings:

- **General** (3 settings): hotkey display, launch at login, show tray icon
- **AI & Models** (4 settings): chat model, polling toggle, poll frequency, poll model
- **Notifications** (2 settings): alert minutes, test notification button
- **Appearance** (2 settings): theme, font size

That's 11 settings total across 4 tabs — about 3 settings per tab. The tab chrome itself takes ~80 LOC of the file (sidebar markup, tab state, role/aria wiring). For a personal-use single-user V1, this is over-engineered.

The simplifier councillor framed it: *"Collapse to one scrollable pane until there are >10 settings total."* Currently there are 11, but several are likely to be removed if `decide-v1-mission-scope.md` chooses pull-only (the entire Background Agent section).

Two paths:
- **Collapse** if the scope decision drops several settings (likely if pull-only)
- **Keep tabs but split files** if the count grows or stays similar

**Value delivered**: Either dramatically simpler settings code, OR the same code organized into per-tab files for maintainability. Either way, less cognitive load.

## Related Files

- `src/renderer/src/components/Settings.tsx` — to refactor or split
- `src/renderer/src/components/Settings.module.css` — styles (sidebar may be unused after collapse)
- `src/renderer/src/components/__tests__/Settings.test.tsx` — 320 LOC of tests; will need updating

## Dependencies

- `decide-v1-mission-scope.md` (in US-v1-hardening) — determines whether Background Agent section exists. If dropped, total settings drop to ~7, strongly favoring collapse.

## Acceptance Criteria

After scope decision, pick one path:

**Path A: Collapse to one scrollable pane (recommended if total settings ≤ 8)**
- [ ] Sidebar removed; all settings rendered in a single scrollable column
- [ ] Settings grouped by section headers (e.g., `## General`, `## Appearance`, `## Notifications`) — visual separation, not interactive tabs
- [ ] `Settings.tsx` reduced to ≤ 200 LOC
- [ ] No regression in existing settings behavior; existing tests updated and pass
- [ ] Same keyboard accessibility (Tab order through all controls)

**Path B: Tabs retained, split into per-tab files (if total settings > 8)**
- [ ] New directory `src/renderer/src/components/settings/`
- [ ] One file per tab: `GeneralTab.tsx`, `AiTab.tsx`, `NotificationsTab.tsx`, `AppearanceTab.tsx`
- [ ] Each tab file < 100 LOC
- [ ] `Settings.tsx` becomes a thin shell: tab state + sidebar + content slot. ≤ 100 LOC.
- [ ] Each tab file has its own focused test file
- [ ] Existing `Settings.test.tsx` reorganized into per-tab tests + a shell test

Both paths:
- [ ] All existing settings still work end-to-end (manually verified)
- [ ] No design system regressions (colors, spacing, focus rings unchanged)
- [ ] Bottom-bar settings button still opens settings; Esc/Cmd+, still toggles

## Verification

**Automated (required):** updated unit tests pass `just check`.

**Ad-hoc:** open settings, change every setting, confirm each takes effect (font size, theme, model, etc.). Check tab order with Tab key.

## Notes

- Path A is preferred for V1 personal-use single-user. The tab chrome buys nothing when each tab is 2–3 settings; users have to click around to find things.
- If Path A is chosen, the sidebar styles in CSS module can be removed; check for orphaned tokens.
- The "test notification" button is functional UI inside settings. If collapsing, ensure it still feels distinct (small visual treatment) so users don't think it's a regular setting.
- Future settings additions (e.g., from VIP lists, notification rules per the gpt councillor's suggestion) may push back toward tabs. Keep the structure changeable; don't bake in assumptions.
