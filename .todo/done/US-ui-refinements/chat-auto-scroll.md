# chat-auto-scroll

## Context
Chat panel has no auto-scroll. When messages or streaming deltas arrive, the user must manually scroll down. Add auto-scroll with scroll-lock (pause when user scrolls up, resume when near bottom).

**Value delivered**: Chat follows conversation automatically without fighting manual scroll-up.

## Related Files
- Modify: `src/renderer/src/components/ChatPanel.tsx`

## Dependencies
- None

## Acceptance Criteria
- [ ] Chat panel scrolls to bottom when new messages are added
- [ ] Chat panel scrolls to bottom on each streaming delta
- [ ] If user scrolls up (>50px from bottom), auto-scroll pauses
- [ ] When user scrolls back near bottom (≤50px), auto-scroll resumes
- [ ] Scroll is instant (no smooth behavior) — performance-critical path
- [ ] Uses `useRef` (not state) for scroll tracking to avoid unnecessary re-renders

## Verification
- `just test` passes
- Manual: send a message, watch chat scroll to bottom; scroll up during streaming, verify it stays put; scroll back down, verify it resumes
