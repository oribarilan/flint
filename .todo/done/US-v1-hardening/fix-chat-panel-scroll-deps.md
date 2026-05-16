# fix-chat-panel-scroll-deps

## Context

`src/renderer/src/components/ChatPanel.tsx:31-37`:
```ts
useEffect(() => {
  if (!isNearBottomRef.current) return;
  const el = panelRef.current;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
});  // <-- no deps array — runs after EVERY render
```

This effect runs on every component render. During streaming, `ChatPanel` re-renders on every token delta. Reading `scrollHeight` forces a layout recalc.

AGENTS.md explicitly designates the streaming path as a **sacred performance path**:
> **Streaming response path** — from `assistant.message_delta` event to rendered text in the chat panel. Must be immediate. If any change would add work to either path — warn, challenge, and suggest deferring to off-path.

Reading `scrollHeight` dozens of times per second on every streaming token directly violates this constraint.

**Value delivered**: Restores the streaming sacred path. ~5 LOC change with measurable perf impact during long responses.

## Related Files

- `src/renderer/src/components/ChatPanel.tsx:31-37` — the offending effect
- `src/renderer/src/components/ChatPanel.tsx:8-13` — props (`messages`, `streamingContent`)
- `AGENTS.md` — Performance-Critical Paths section

## Dependencies

None.

## Acceptance Criteria

- [ ] `useEffect` gains explicit deps array: `[messages, streamingContent]`
- [ ] Optionally wrap the scroll mutation in `requestAnimationFrame` to coalesce multiple deltas within a single frame (rationale: streaming can fire bursts of tokens; one rAF per frame is enough)
- [ ] Behavior unchanged from user perspective: chat still auto-scrolls during streaming when user is at bottom; still pauses when user has scrolled up; still resumes when user scrolls back near bottom
- [ ] Unit test in `src/renderer/src/components/__tests__/ChatPanel.test.tsx` (create if doesn't exist) asserting:
  - Effect runs when `messages` changes
  - Effect runs when `streamingContent` changes
  - Effect does NOT run when an unrelated parent re-render occurs (test by re-rendering with same props)
- [ ] Manual smoke test: send a long chat message, watch a long streaming response, confirm scroll behavior matches before/after

## Verification

**Automated (required):** the test described above.

**Ad-hoc:** in dev mode, send a prompt that produces a long markdown response (e.g., "list 50 things to think about for Q4 planning"). Watch the response stream in. Confirm:
- Smooth scroll-to-bottom while streaming
- Scrolling up mid-stream pauses auto-scroll
- Scrolling back down resumes auto-scroll
- No visible jank

Optionally profile with React DevTools Profiler before/after to confirm reduced render cost during streaming.

## Notes

- This is the smallest task in the user story but on a sacred performance path.
- Do NOT add `behavior: "smooth"` to the scroll — instant scroll is intentional per the existing spec (`docs/superpowers/specs/2026-04-25-ui-refinements-design.md`).
- The `isNearBottomRef` is fine as a ref (doesn't need to be state) because the effect doesn't depend on it for re-running — it's read at execution time only.
