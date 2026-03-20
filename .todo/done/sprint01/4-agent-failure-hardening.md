# Sprint01-4: Agent Failure Hardening + Double-Token Validation

## Summary

Agent mode must fail gracefully when OpenCode is disconnected, restarting, or returning errors. This ticket hardens user-facing failure handling and fixes known duplicate-token sources (Rust dual-emission path and frontend listener registration risk), with minimal diagnostics left for observability.

## Requirements

- Non-blocking, actionable UX for disconnected and error states.
- Preserve keyboard-first interactions and escape layering.
- Validate duplicate-token risk with deterministic diagnostics.
- Avoid heavy work on overlay-ready or token-processing hot paths.

## Implementation

### Scope

1. Improve disconnected/error/timeout UI messaging and retry affordances.
2. Ensure restart/reconnect transitions do not leave stale streaming states.
3. Add low-noise diagnostics for duplicate emit vs duplicate listener.
4. Validate duplicate-token fix path with focused tests and a bounded verification matrix.

### Proposed Changes

- **Failure-state UX hardening**
  - In `src/components/ChatPanel.tsx` and relevant stores/hooks, show clear status + retry controls for:
    - provider unavailable
    - server restarting
    - send failure
  - Keep errors contextual and dismissible, avoid blocking normal input where safe.

- **State-transition correctness**
  - Ensure transitions between disconnected/connecting/connected reset transient flags correctly (`isStreaming`, waiting indicator, tool-call indicators).

- **Duplicate-token validation**
  - **Audit note — dual `chat:token` emit path is deterministic, not just "not reproducible":**
    - `events.rs:148–153`: `message.part.delta` emits `chat:token`.
    - `events.rs:205–209`: `message.part.updated` (type=`text`) also emits `chat:token` from `handle_part_updated()`.
    - If OpenCode sends both events for the same text segment (which is its documented behavior — `delta` carries the increment, `updated` carries the snapshot), both paths fire and every token is doubled on the Rust side.
    - **This should be treated as a confirmed root cause, not a hypothesis.** The fix is: emit from `message.part.delta` only; remove the `chat:token` emit from the `"text"` arm of `handle_part_updated()` in `events.rs`. Validate by asserting token count in a Rust unit test.
  - **Audit note — StrictMode double-listener (frontend second source):**
    - `useChat.ts:41-49`: The `cancelled` flag only covers a narrow race window. In React StrictMode, `setup()` resolves synchronously before the cleanup fires, so two listener registrations survive and every token is doubled on the frontend side — independently of the Rust path above.
    - Fix: convert listener registration to a `ref`-based pattern (store unlisteners in a `useRef`, skip re-registration if ref is already populated) or use a stable effect guard that survives StrictMode's double-invoke.
  - Add dev-only diagnostics in `events.rs` and `useChat.ts` to distinguish duplication source after fix is in place.

### Related Files

- `src/components/ChatPanel.tsx`
- `src/hooks/useChat.ts`
- `src/stores/chatStore.ts`
- `src/lib/commands.ts`
- `src-tauri/src/providers/opencode/events.rs`

## Acceptance Criteria

- [ ] Disconnected/restarting/error states show clear user-facing guidance and retry actions.
- [ ] Reconnect/restart transitions do not leave stale streaming/waiting UI.
- [ ] Duplicate-token root causes (dual Rust emit path + StrictMode double-listener) are fixed and validated.
- [ ] Rust unit test asserts `chat:token` is emitted exactly once per text delta (not doubled by `message.part.updated`).
- [ ] Frontend test asserts listener count stays at 1 under StrictMode-like double-invoke.
- [ ] Dev-only diagnostics remain in place for ongoing observability.
- [ ] Verification matrix is time-boxed (max 2 hours) and documented in task notes.

## Verification

- Unit tests for failure-state rendering/behavior.
- Focused simulator E2E for disconnect/retry/reconnect path.
- Run:
  - `just test-frontend`
  - `just test-rust` (if Rust diagnostics changed)

## Risks

- Over-instrumentation creating noisy logs.
- Error-state UI complexity increasing escape-layering regressions.
- If diagnostics are left always-on (not dev-gated), token path noise can obscure real failures.

## Out of Scope

- Full eventing architecture rewrite.
- Unrelated broad UX redesign.
