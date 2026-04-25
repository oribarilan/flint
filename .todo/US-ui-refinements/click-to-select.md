# click-to-select

## Context
Currently each attention card has separate "Select" and "Open" buttons. Simplify: clicking anywhere on the card toggles selection, "Select" button is removed, "Open" button stays with a more prominent (accent/filled) style.

**Value delivered**: Faster, more intuitive card interaction. Cleaner card UI.

## Related Files
- Modify: `src/renderer/src/components/AttentionCard.tsx`
- Modify: `src/renderer/src/components/AttentionCard.module.css`

## Dependencies
- `lucide-icons.md` (uses Lucide `ExternalLink` icon in Open button)

## Acceptance Criteria
- [ ] Clicking anywhere on card toggles selection (no separate Select button)
- [ ] "Select" button is removed from the card
- [ ] "Open" button uses accent/filled style (like current Select button)
- [ ] "Open" button uses Lucide `ExternalLink` icon instead of ↗ text
- [ ] Clicking "Open" only opens (does not also select) — `stopPropagation`
- [ ] Card has `role="button"`, `tabIndex={0}`, Enter/Space keyboard support
- [ ] Card has `:focus-visible` outline
- [ ] Card has `cursor: pointer`
- [ ] `just check` passes

## Verification
- `just check` passes
- Manual: click card → toggles selection; click Open → opens without selecting; Tab to card → focus ring visible; Enter/Space → toggles selection
