# Popover Layout & Components

## Context

Replace the split-panel App layout with a single scrollable column for the narrow popover. Proactive briefing first, chat input at bottom.

**Value delivered**: The popover proactively shows upcoming meetings and action items without panel navigation. Chat is one keystroke away.

## Related Files

- `src/renderer/src/App.tsx` — single-column layout with view routing (briefing/chat)
- `src/renderer/src/App.module.css` — popover layout CSS
- `src/renderer/src/components/Greeting.tsx` — time-based greeting with context
- `src/renderer/src/components/MeetingRow.tsx` — compact meeting rows
- `src/renderer/src/components/AttentionRow.tsx` — attention items
- `src/renderer/src/components/ChatPanel.tsx` — chat messages
- `src/renderer/src/components/ChatInput.tsx` — chat input

## Dependencies

- `1-popover-window.md`

## Acceptance Criteria

- [x] App renders a single scrollable column (no split panels)
- [x] Greeting component shows time-based text with context line
- [x] Meeting rows: compact, icon + title + meta + time
- [x] Imminent meetings show accent styling
- [x] Attention section: compact rows with icon + title + description
- [x] Section labels "Next up" and "Attention"
- [x] Chat input at panel bottom, always visible, sends via `chat:send` IPC
- [x] Content scrolls when exceeding panel height, `overscroll-behavior: contain`
- [x] Empty state when no meetings or attention items
- [x] Keyboard shortcuts work: Escape closes, Enter sends chat
- [x] Settings accessible — **via tray context menu "Settings…" item opening standalone window**
- [x] `just check` passes

## Verification

- **Automated**: Unit tests for Greeting, MeetingRow, AttentionRow, App view toggling all pass.
- **Ad-hoc**: Layout matches validated showcase design.

## Notes

Settings moved to a standalone BrowserWindow (660+ px, resizable, centered on active display) opened from the tray context menu. Not in the popover — too narrow. Model picker, hotkey hints removed from the popover footer as planned.
