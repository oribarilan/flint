# Sprint01-2: OpenCode Session Context Alignment (No Local History Push)

## Summary

Flint should treat OpenCode session state as the source of truth for conversation context. This task explicitly avoids pushing full local history on every send. Instead, it ensures delta-only sends continue to work, and that frontend context can be rehydrated from OpenCode session history (`get_session_messages`) whenever needed (startup/reconnect/new-session transitions).

## Requirements

- Keep message send delta-only (latest user message only).
- Rely on OpenCode session continuity for multi-turn context.
- Add explicit hydration/re-sync rules so frontend state remains consistent with backend session.
- Keep existing streaming/tool-event behavior unchanged.

## Implementation

### Scope

1. Keep current `send_chat_message` delta contract unchanged.
2. Define when frontend must call `get_session_messages` to rehydrate authoritative context.
3. Ensure new-session and reconnect flows reset/rehydrate deterministically.
4. Add tests for session continuity, hydration order, and empty-history behavior.

### Proposed Changes

- **Send contract stays minimal**
  - Keep `src/App.tsx` + `src/lib/commands.ts` + `src-tauri/src/commands.rs` send signatures delta-only.
  - Document this contract to prevent future drift toward duplicate local history push.

- **Hydration strategy**
  - Use `get_session_messages` for:
    - initial agent-mode hydration when local store is empty but session exists
    - post-reconnect state sync
    - post-`clear_chat` confirmation path
  - **Audit note — post-`clear_chat` hydration is currently unwired:** The hydration effect at `ChatPanel.tsx:396-413` re-fires only on `chatStatus.connected` changes. After `clear_chat`, `connected` stays `true` — so the effect never re-triggers to re-hydrate. Explicitly wire the effect to also fire on session ID change or add a dedicated clear+rehydrate sequence so post-clear hydration is deterministic.
  - Ensure stable chronological rendering and idempotent merge behavior.

- **Session consistency rules**
  - If backend session changes, local timeline should reset/replace rather than append stale entries.
  - Keep tool-call and streaming transient states separate from persisted history hydration.

### Related Files

- `src/App.tsx`
- `src/lib/commands.ts`
- `src/stores/chatStore.ts`
- `src-tauri/src/commands.rs`
- `src-tauri/src/providers/opencode/mod.rs`
- `src-tauri/src/providers/opencode/client.rs`
- `src/hooks/useChat.ts`

## Acceptance Criteria

- [ ] Multi-turn behavior works while send path remains delta-only.
- [ ] Frontend rehydrates from `get_session_messages` on defined transitions:
  - agent-mode mount when local messages are empty and session exists,
  - reconnect after disconnection,
  - post-`clear_chat` session reset.
- [ ] Hydrated messages render in correct chronological order without duplication.
- [ ] Empty/first-message flow still works exactly as before.
- [ ] Rust/frontend tests validate contract: no full local-history payload added to send path.
- [ ] No regression in token/tool event streaming contract.

## Verification

- Rust unit tests for session-message retrieval and send contract invariants.
- Frontend tests for hydration triggers and timeline replacement/merge behavior.
- Required assertions:
  - send IPC payload remains message-only (no history array added).
  - post-`clear_chat` path actually triggers rehydration (no dependency on `connected` toggling only).
- Run:
  - `just test-rust`
  - `just test-frontend`
  - `just lint-rust`

## Risks

- Session mismatch between local UI and backend can cause duplicate/stale rendering.
- Rehydration timing races during reconnect/new-session transitions.
- **`get_session_messages` lock contention during restart:** In `commands.rs`, `get_session_messages` holds a read lock on `OpenCodeProviderState`. If `init_opencode` (which acquires a write lock) is mid-flight during a restart, `get_session_messages` returns `ServerNotRunning` and the error is silently swallowed. Add retry-once logic (wait ~200 ms, retry) so transient lock contention during reconnect doesn't silently drop the rehydration attempt.
- **Rollback control:** if hydration response fails validation or fetch fails after retry, keep current local timeline unchanged (do not wipe) and expose a non-blocking sync warning.

## Out of Scope

- Sending full local history with each message.
- Semantic summarization/compression of history.
- Persistent chat transcript storage beyond existing session state.
