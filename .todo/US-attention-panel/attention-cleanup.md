# Task: attention-cleanup

## Context
Remove old meeting-specific components and stores that are replaced by the generic attention panel. Update the system prompt to instruct the agent about `set_attention_items`.

**Value delivered**: Clean codebase with no dead meeting-specific UI code. Agent knows how to use the attention panel.

## Related Files
- `src/renderer/src/components/MeetingCards.tsx` — delete
- `src/renderer/src/components/MeetingCards.module.css` — delete
- `src/renderer/src/components/MeetingDetail.tsx` — delete
- `src/renderer/src/components/MeetingDetail.module.css` — delete
- `src/renderer/src/stores/meetingStore.ts` — delete
- `src/renderer/src/hooks/useMeetings.ts` — delete
- `src/renderer/src/stores/__tests__/meetingStore.test.ts` — delete
- `src/main/index.ts` — update system prompt
- `src/main/ipc/channels.ts` — remove old `MEETINGS_*` channels
- `src/main/ipc/handlers.ts` — remove old meetings handlers
- `src/preload/index.ts` — remove old meetings IPC methods

## Dependencies
- `attention-ui.md` — AttentionPanel must be integrated before removing MeetingCards
- `attention-context-injection.md` — context injection must work before removing meeting-specific selection

## Acceptance Criteria
- [ ] No files named `MeetingCards`, `MeetingDetail`, `meetingStore`, `useMeetings` exist in the renderer
- [ ] No `MEETINGS_GET`, `MEETINGS_UPDATE`, `MEETING_JOIN` in `IPC_CHANNELS`
- [ ] No meeting-specific IPC methods in preload
- [ ] System prompt includes instructions for `set_attention_items` tool usage
- [ ] `grep -r "MeetingCards\|MeetingDetail\|meetingStore\|useMeetings" src/` returns no results
- [ ] All tests pass (`just test`)
- [ ] Build passes (`just build`)

## Verification
- **Ad-hoc**: grep for dead references, `npx vitest run`, `npx electron-vite build`

## Scope Estimate
Small
