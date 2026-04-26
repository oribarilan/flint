# token-cleanup

## Context

The audit found ~12 hardcoded values across 4 CSS modules and 4 missing tokens in `global.css`. This task creates the missing tokens and replaces all hardcoded values.

**Value delivered**: Full design token compliance. Every visual property in component CSS flows through semantic tokens — no raw oklch/rgba/px values.

## Related Files

- `src/renderer/src/styles/global.css` — add missing tokens
- `src/renderer/src/App.module.css` — hardcoded box-shadow (line 11)
- `src/renderer/src/components/AttentionCard.module.css` — hardcoded oklch warning-bg (line 110), sub-token spacing
- `src/renderer/src/components/Settings.module.css` — hardcoded oklch backdrop (line 10)
- `src/renderer/src/components/HotkeyHint.module.css` — sub-token spacing
- `src/renderer/src/components/MarkdownContent.module.css` — sub-token spacing

## Dependencies

- None

## Acceptance Criteria

- [ ] `global.css` has `--color-warning-bg: oklch(78% 0.15 85 / 0.12)` (dark theme value)
- [ ] `global.css` has `--bg-backdrop: oklch(0% 0 0 / 0.5)`
- [ ] `global.css` has `--shadow-window` token for the main overlay shadow
- [ ] `global.css` has `--space-2xs: 2px` for sub-grid precision values
- [ ] `App.module.css` line 11: `box-shadow` uses `var(--shadow-window)` instead of inline rgba
- [ ] `AttentionCard.module.css` line 110: uses `var(--color-warning-bg)` instead of inline oklch
- [ ] `Settings.module.css` line 10: uses `var(--bg-backdrop)` instead of inline oklch
- [ ] All `1px`, `2px`, `3px` spacing values in HotkeyHint, MarkdownContent, AttentionCard use `var(--space-2xs)` where appropriate (not border widths — those stay as px per spec)
- [ ] `5px` and `7px` padding values replaced with nearest token or `var(--space-xs)` / `var(--space-sm)`
- [ ] No hardcoded oklch/rgba/rgb colors remain in any `.module.css` file
- [ ] `just check` passes

## Verification

- **Automated**: `grep -r 'oklch\|rgba\|rgb(' src/renderer/src/components/*.module.css src/renderer/src/App.module.css` returns zero matches
- **Ad-hoc**: `just check` passes; visual inspection in dev mode shows no regressions
