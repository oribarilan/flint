# Glass Visual Treatment

## Context

Apply the frosted glass aesthetic validated in the showcase mockup. The desktop bleeds through the panel via heavy backdrop-filter blur.

**Value delivered**: The popover achieves a native-feeling macOS aesthetic, looking like a first-party system panel.

## Related Files

- `src/renderer/src/styles/global.css` — glass tokens (`--glass-bg`, `--glass-border`, etc.)
- `src/renderer/src/App.module.css` — panel root with glass surface
- Component CSS modules (MeetingRow, AttentionRow, Greeting, ChatInput)
- `showcases/menubar-popover-showcase.html` — visual reference

## Dependencies

- `2-popover-layout.md`

## Acceptance Criteria

- [x] Panel background: semi-transparent with `backdrop-filter: blur(60px) saturate(200%)`
- [x] Desktop visibly bleeds through the panel
- [x] Meeting rows have no borders or card backgrounds — content sits on the glass
- [x] Hover states: subtle rgba overlay
- [x] Section dividers: subtle 1px
- [x] Chat input: darker glass surface with subtle border
- [x] Icon containers: 24px with subtle background
- [x] Panel border: 1px with inner glow
- [x] Panel shadow: deep multi-layer
- [x] Light theme glass works (inverted token values)
- [x] `prefers-reduced-motion` respected
- [x] Glass tokens added to `global.css` without breaking existing consumers
- [x] `just check` passes

## Verification

- **Ad-hoc**: Verified — glass effect works on both dark and light themes, desktop colors bleed through.

## Notes

Glass tokens added as separate variables (`--glass-bg`, `--glass-border`, `--glass-row-hover`, etc.) alongside existing solid tokens. Settings window and Spotlight window use the solid token set, not glass.
