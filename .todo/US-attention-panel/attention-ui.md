# Task: attention-ui

## Context
Build the `AttentionPanel` and `AttentionCard` components that render in the left panel. Cards show icon, title, description, Select, and Open buttons. Items are grouped by time (day separators). Selected cards get visual highlighting.

**Value delivered**: The left panel renders agent-pushed items as interactive cards with time grouping and selection state.

## Related Files
- `src/renderer/src/components/AttentionPanel.tsx` — new
- `src/renderer/src/components/AttentionCard.tsx` — new
- `src/renderer/src/components/AttentionPanel.module.css` — new
- `src/renderer/src/components/AttentionCard.module.css` — new
- `src/renderer/src/stores/attentionStore.ts` — new Zustand store
- `src/renderer/src/hooks/useAttention.ts` — new hook
- `src/renderer/src/App.tsx` — integrate AttentionPanel in left split

## Dependencies
- `attention-data-model.md` — needs `AttentionItem` type and IPC channels

## Acceptance Criteria
- [ ] `attentionStore` Zustand store holds `items: AttentionItem[]`, `selectedIds: Set<string>`, and actions `setItems`, `toggleSelect`, `clearSelection`
- [ ] `useAttention` hook subscribes to `attention:update` IPC, loads initial items, exposes selection actions
- [ ] `AttentionCard` renders icon, title (1 line, truncated), description (2 lines max, truncated), Select button, Open button (only when `openAction` present)
- [ ] Clicking Select toggles the card's selection state (visual checkmark + accent border)
- [ ] Clicking Open calls `window.flint.openAttentionItem(id)`
- [ ] `AttentionPanel` groups items by time bucket: "Now", "Later Today", "Tomorrow", "This Week", "Later" — using day separator headers
- [ ] Items without `timestamp` go into an "Other" group at the bottom
- [ ] Empty state: "No items yet. Ask me about your day." with ⚡ icon
- [ ] `App.tsx` renders `AttentionPanel` in the left split instead of `MeetingCards`
- [ ] All styling uses design tokens from `global.css`, no hardcoded colors
- [ ] Build passes

## Verification
- **Automated**: unit test for `attentionStore` in `src/renderer/src/stores/__tests__/attentionStore.test.ts`
- **Ad-hoc**: `npx electron-vite build` succeeds, visual inspection in dev mode

## Scope Estimate
Large

## Notes
- Reference `showcases/attention-time-showcase.html` for time grouping visual options (day separators variant recommended)
- Imminent items (timestamp within alertMinutes) should get amber styling
