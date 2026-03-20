# Sprint01-1: Escape Session Correctness + Streaming UX

## Summary

Agent mode currently clears frontend chat state on Escape, but backend OpenCode session reset must be explicitly aligned to avoid hidden context drift. Streaming also needs clearer waiting feedback and stable auto-scroll behavior that does not add work to the token hot path. This task delivers correctness and immediate UX clarity for every chat interaction.

## Requirements

- Follow `spec.md` Escape layering behavior for Agent mode.
- Keep keyboard-first interactions intact.
- Respect design/motion rules in `specs/design.md` (including reduced-motion).
- Do not degrade result-processing critical path.

## Implementation

### Scope

1. Wire Escape layer action to backend `clear_chat` command (not frontend-only clear).
2. Add explicit waiting/typing indicator between send and first token.
3. Add safe auto-scroll behavior that avoids per-token layout thrash.
4. Preserve current model-picker and slash-menu escape semantics.

### Proposed Changes

- **Session clear integration**
  - **Current asymmetry to fix:** Cmd/Ctrl+N path already calls backend `clearChat` IPC (`useKeybindings.ts:102-111`), while Escape layer 3 (`useKeybindings.ts:199-203`) currently clears frontend state only.
  - In `src/hooks/useKeybindings.ts`, augment Escape layer-3 behavior to mirror Cmd/Ctrl+N semantics: call backend `clearChat` IPC (`src/lib/commands.ts`) and then sync store reset.
  - Ensure failures show non-blocking UI feedback and do not leave mixed states.

- **Streaming UX states**
  - **Audit note:** `ChatPanel.tsx:590` already renders a "thinking" indicator as `isStreaming && currentResponse.length === 0 && activeToolCalls.length === 0`. Before adding a new `isWaitingForFirstToken` store flag, verify whether this derived condition already covers the needed UX. Add the explicit flag only if the existing condition is insufficient (e.g., if it needs to survive a store reset mid-flight).
  - In `src/stores/chatStore.ts`, add an explicit flag for `isWaitingForFirstToken` (or equivalent derived state) **only if the audit above finds the existing condition lacks coverage**.
  - In `src/components/ChatPanel.tsx`, render a lightweight typing/waiting indicator when waiting for first token; transition to streaming state once first token arrives.

- **Auto-scroll strategy**
  - Use message-boundary/state-change `useEffect` with a bottom sentinel ref.
  - **Audit note:** The current dep array at `ChatPanel.tsx:440` is `[messages, currentResponse, activeToolCalls]`. `currentResponse` causes a layout read+write on every single token — this is the exact thrash to fix. Switch dependency to message-boundary/state transitions only; remove `currentResponse` from the scroll dep array.
  - Avoid invoking scroll on every token append callback if it causes repeated forced layout.
  - Respect user manual scroll-up (optional guard): only autoscroll when user is near bottom.

### Related Files

- `src/hooks/useKeybindings.ts`
- `src/components/ChatPanel.tsx`
- `src/stores/chatStore.ts`
- `src/lib/commands.ts`
- `src/components/HintBar.tsx` (if hints need state-specific updates)

## Acceptance Criteria

- [ ] Pressing Escape in Agent mode clears frontend messages **and** creates a new backend session via `clear_chat`.
- [ ] Waiting/typing indicator appears after send and before first token, and disappears on first `chat:token` or terminal event (`chat:done`/`chat:error`).
- [ ] Auto-scroll no longer runs from a per-token dependency (`currentResponse` removed from scroll trigger deps) and follows message-boundary/state transitions.
- [ ] Existing Escape layering tests remain green; add/update tests for new behavior.
- [ ] No regressions in slash menu/model picker keyboard behavior.

## Verification

- Frontend unit tests:
  - `src/hooks/__tests__/useKeybindings.test.ts`
  - `src/components/__tests__/ChatPanel*.test.tsx` (new or updated)
- Commands/store tests as needed.
- Required assertions:
  - Escape layer 3 test must assert backend IPC `clearChat()` was invoked (not only local `messages=[]`).
  - Waiting indicator transition test must cover token arrival and error/done terminal paths.
- Run: `just test-frontend`

## Risks

- Async clear call race with immediate UI hide/show.
- Incorrect waiting-state transitions causing stuck indicator.
- **StrictMode double-listener risk:** `useChat.ts:41-49` uses a `cancelled` flag that guards a narrow async race window. In React StrictMode, `setup()` may resolve before the cleanup fires, registering two listener sets and doubling every token. The fix belongs in ticket 4 (hardening), but **the test for Escape session reset in this ticket must also verify listener count** to avoid masking this issue during testing.
- **Escape IPC test gap:** `useKeybindings.test.ts:146` currently only asserts `messages=[]` but does not assert the `clearChat` IPC call. The new/updated test for this ticket must explicitly assert the IPC was invoked.
- **Rollback control:** if backend `clearChat` IPC fails, keep local clear (fresh UI) but surface a non-blocking warning and schedule one retry to avoid silent backend/UI divergence.

## Out of Scope

- Full chat timeline virtualization changes.
- General E2E suite cleanup unrelated to this flow.
