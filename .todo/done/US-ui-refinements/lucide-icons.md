# lucide-icons

## Context
Install `lucide-react` and create an `AttentionIcon` component that maps icon name strings to Lucide SVG components.

**Value delivered**: Establishes the SVG icon system used by all other visual tasks.

## Related Files
- Create: `src/renderer/src/components/AttentionIcon.tsx`
- Create: `src/renderer/src/components/__tests__/AttentionIcon.test.tsx`
- Modify: `package.json`

## Dependencies
- None

## Acceptance Criteria
- [ ] `lucide-react` is in `package.json` dependencies
- [ ] `AttentionIcon` component renders correct Lucide SVG for known names (calendar, message-circle, mail, file-text)
- [ ] `AttentionIcon` renders a fallback `Circle` icon for unknown names
- [ ] `size` prop controls SVG dimensions
- [ ] Unit tests cover all mapped icon names + fallback

## Verification
- `just test` passes, specifically `AttentionIcon.test.tsx`
