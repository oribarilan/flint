# Task: attention-ui

## Context
Build the `AttentionPanel` and `AttentionCard` components that render in the left panel. Cards show icon, title, description, time badge, Select, and Open buttons. The panel is a flat list ordered by the agent — no time-based grouping. Each card has a small relative-time badge for temporal context.

**Value delivered**: The left panel renders agent-pushed items as interactive cards with time badges and selection state.

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
- [ ] `AttentionCard` renders icon, title (1 line, truncated), description (2 lines max, truncated), time badge (top-right pill), Select button, Open button (only when `openAction` present)
- [ ] Time badge shows relative time ("in 4 min", "2h ago", "yesterday") — amber color for future/imminent items, muted for past
- [ ] Clicking Select toggles the card's selection state (visual checkmark + accent border)
- [ ] Clicking Open calls `window.flint.openAttentionItem(id)`
- [ ] `AttentionPanel` renders items as a flat list in agent-provided order — no automatic sorting or time grouping
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
- Reference Variant C (Time Badges) in `showcases/attention-time-showcase.html` for badge styling
- Imminent items (timestamp within alertMinutes of now) get amber badge; past timestamps get muted badge
- The agent controls ordering — the panel renders items in the order received from `set_attention_items`
