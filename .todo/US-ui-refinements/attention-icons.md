# attention-icons

## Context
Replace emoji characters in AttentionCard and AttentionPanel with Lucide SVG icons via the `AttentionIcon` component.

**Value delivered**: Attention pane uses clean, consistent SVG icons instead of emoji.

## Related Files
- Modify: `src/renderer/src/components/AttentionCard.tsx`
- Modify: `src/renderer/src/components/AttentionCard.module.css`
- Modify: `src/renderer/src/components/AttentionPanel.tsx`
- Modify: `src/renderer/src/components/AttentionPanel.module.css`
- Modify: `src/main/types.ts` (doc comment)
- Modify: `src/renderer/src/stores/__tests__/attentionStore.test.ts`

## Dependencies
- `lucide-icons.md` (AttentionIcon component must exist)

## Acceptance Criteria
- [ ] AttentionCard renders `AttentionIcon` instead of raw `item.icon` string
- [ ] Icon container CSS uses `color` (for SVG fill) instead of `font-size`
- [ ] Empty state in AttentionPanel uses Lucide `Zap` instead of ⚡ emoji
- [ ] `AttentionItem.icon` doc comment references Lucide names, not emoji
- [ ] Existing attentionStore tests updated with icon name strings
- [ ] `just test` passes

## Verification
- `just test` passes
- Visual: attention cards show SVG icons, not emoji text
