# hotkey-hint

## Context

Flint needs a reusable component that renders keyboard shortcut hints as styled key caps. This will be used in the bottom bar, tooltips, settings, and anywhere else shortcuts are displayed.

**Value delivered**: A composable, well-designed component available for all shortcut hints across the app.

## Related Files

- `src/renderer/src/components/HotkeyHint.tsx` — new component
- `src/renderer/src/components/HotkeyHint.module.css` — new styles
- `src/renderer/src/styles/global.css` — design tokens

## Dependencies

- None

## Acceptance Criteria

- [x] `HotkeyHint` component accepts a `keys` prop: `string[]` where each string is a key name
- [x] Modifier keys render as word labels: `ctrl` → `Ctrl`, `cmd`/`meta` → `Cmd`, `shift` → `Shift`, `alt`/`option` → `Alt` (changed from symbols per user direction)
- [x] Special keys render as symbols: `enter` → `↵`, `space` → `␣`, `escape` → `esc`
- [x] Regular keys render uppercase: `j` → `J`, `/` → `/`
- [x] Each key rendered in its own pill/cap: `--bg-secondary` background, `--border-subtle` border, `--radius-sm` corners, `--font-xs` size, `--font-mono` font
- [x] Text color: `--text-placeholder` (muted, non-competing)
- [x] Multiple keys render side by side with `--space-xs` gap
- [x] Component accepts optional `className` prop for positioning by consumers
- [x] `aria-hidden="true"` on the component (hints are decorative, not functional)
- [x] Unit tests: renders single key, renders modifier+key combo, renders special keys, applies custom className

## Verification

- **Automated**: Unit tests for rendering variants (single key, combo, special keys, className)
- **Ad-hoc**: `just check` passes. Visual inspection in dev mode.

## Notes

Keep the component simple — no tooltip behavior, no interactive states. It's a pure display component. The styling should be subtle enough to sit inside body text or a toolbar without drawing attention.
