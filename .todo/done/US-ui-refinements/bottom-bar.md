# bottom-bar

## Context
Move the app chrome header from the top to the bottom. Remove branding (⚡ FLINT), keep only a settings button with a Lucide Settings icon.

**Value delivered**: More screen space for content; cleaner, less branded UI.

## Related Files
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.module.css`

## Dependencies
- `lucide-icons.md` (lucide-react must be installed for Settings icon)

## Acceptance Criteria
- [ ] No header element at top of app
- [ ] Footer/bottom bar with settings button spans full width at bottom
- [ ] Settings button uses Lucide `Settings` icon (not ⚙ emoji)
- [ ] No "FLINT" text or ⚡ icon visible in the app chrome
- [ ] Cmd+, / Ctrl+, keyboard shortcut still opens settings
- [ ] `just check` passes

## Verification
- `just check` passes
- Visual: settings gear at bottom-right, no top bar
