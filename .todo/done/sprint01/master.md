# Sprint 01 — Second Brain / Chat Reliability & UX

## Summary

This sprint plans a lean set of six chat-focused deliverables that make Agent mode robust for daily use: Escape/session correctness, streaming UX polish, OpenCode session-context alignment, settings controls, failure hardening, and regression protection via tests + CI. The sequence is optimized for fast user-visible value while minimizing merge conflicts and avoiding regressions in critical paths. Double-token handling is treated as a hardening fix/verification area (Rust dual-emission + frontend listener registration risk), not a speculative investigation.

## Decisions

### In-Scope Items (Lean Scope: 6 Tickets)

1. Escape + streaming UX polish (typing indicator + safe auto-scroll)
2. OpenCode session-context alignment (delta sends + hydration)
3. Agent Settings controls (repo path + connection status/restart)
4. Agent failure hardening + double-token validation
5. Chat regression tests (unit + focused E2E)
6. CI check workflow baseline

### Execution Tracking (Owner • Effort • Dependencies)

| Ticket | File                                          | Owner | Effort | Dependencies |
| ------ | --------------------------------------------- | ----- | ------ | ------------ |
| 1      | `.todo/sprint01/1-escape-and-streaming-ux.md` | TBD   | M      | None         |
| 2      | `.todo/sprint01/2-conversation-context.md`    | TBD   | M      | 1            |
| 3      | `.todo/sprint01/3-agent-settings-controls.md` | TBD   | M      | 2            |
| 4      | `.todo/sprint01/4-agent-failure-hardening.md` | TBD   | M      | 1, 2, 3      |
| 5      | `.todo/sprint01/5-chat-regression-tests.md`   | TBD   | M      | 1, 2, 3, 4   |
| 6      | `.todo/sprint01/6-ci-check-workflow.md`       | TBD   | S      | 5            |

Owner assignment note: keep `TBD` until explicit assignees are confirmed.

### Sequence Rationale

- **Order:** 1 → 2 → 3 → 4 → 5 → 6
- **Why this order:**
  - Item 1 delivers immediate UX and correctness wins for every agent session.
  - Item 2 keeps OpenCode as source of truth for context and avoids redundant local history payload management.
  - Item 3 improves configurability/onboarding once chat behavior is stable.
  - Item 4 hardens failure states and validates token-stream duplication risk.
  - Item 5 adds cross-ticket focused E2E coverage and closes any remaining regression gaps.
  - Item 6 gates future regressions in CI.

### Quality Bar (Per Ticket)

- Every ticket requires:
  - Unit tests for changed logic in the same ticket (tickets 1-4)
  - Focused simulator E2E coverage for impacted user flows (ticket 5, then enforced in ticket 6)

### Critical Path Guardrails

- **Overlay ready path:** no new network/disk/heavy compute on hotkey show path.
- **Result processing path:** streaming UX must avoid per-token expensive work; scrolling logic should run on message-boundary/state transitions, not on every token append.

## Implementation

### Phase 1 — Session/Escape correctness + streaming UX

- Execute `.todo/sprint01/1-escape-and-streaming-ux.md`
- Exit criteria:
  - Escape in Agent mode clears both frontend state and backend OpenCode session.
  - Waiting/streaming states are visually clear and keyboard behavior remains consistent.

### Phase 2 — OpenCode session-context alignment

- Execute `.todo/sprint01/2-conversation-context.md`
- Exit criteria:
  - Sends remain delta-only (no duplicated local history payloads).
  - Session hydration path restores authoritative context from OpenCode when needed.
  - Existing tests validate session continuity and no regressions in send flow.

### Phase 3 — Agent Settings controls

- Execute `.todo/sprint01/3-agent-settings-controls.md`
- Exit criteria:
  - Repo path can be viewed/updated via Settings.
  - Status and restart action are available and accurately reflected in UI.

### Phase 4 — Agent failure hardening + double-token validation

- Execute `.todo/sprint01/4-agent-failure-hardening.md`
- Exit criteria:
  - Core failure states have user-facing non-blocking handling + retry.
  - Reproduction matrix for duplicate tokens completed with safeguards in place.

### Phase 5 — Regression test expansion

- Execute `.todo/sprint01/5-chat-regression-tests.md`
- Exit criteria:
  - Sprint-critical cross-ticket chat flows are covered by focused E2E tests.

### Phase 6 — CI baseline

- Execute `.todo/sprint01/6-ci-check-workflow.md`
- Exit criteria:
  - PR checks enforce core lint/test/build + focused chat regression tests.

## Verification Plan

- Per-ticket targeted tests and checks listed in each task file.
- Manual smoke checklist before sprint close:
  - Send → waiting indicator → stream render
  - Escape layer walkdown ends in clean session reset
  - New session has no stale context artifacts
  - Disconnect/retry/reconnect behaves without stuck UI states
- Sprint-level checks after all 6:
  - `just test-frontend`
  - `just test-rust`
  - `just lint-rust`
  - `just format`

## Definition of Done (Sprint)

- [ ] Tickets 1-4 ship with matching unit tests in the same PR.
- [ ] Ticket 5 ships focused E2E scenarios for sprint-critical flows.
- [ ] Ticket 6 enforces focused chat E2E as required PR checks.
- [ ] Delta-send contract preserved (`send_chat_message` remains message-only).
- [ ] Session hydration is deterministic on defined triggers and avoids duplication.
- [ ] Escape layer 3 resets both frontend timeline and backend OpenCode session.
- [ ] No additional work added to overlay-ready path.
- [ ] No per-token expensive side effects added to token render path.

## Risks

- Session hydration timing can cause stale or duplicated local rendering if state transitions are not explicit.
- **Post-`clear_chat` hydration is unwired:** The hydration effect re-fires on `chatStatus.connected` changes only. After `clear_chat`, `connected` stays `true`, so rehydration never triggers. This must be explicitly wired in ticket 2.
- UI changes in streaming path can accidentally introduce jitter or stale indicators.
- **Dual `chat:token` emit path (deterministic double-token):** Both `message.part.delta` (events.rs:148) and `message.part.updated` type=`text` (events.rs:207) emit `chat:token`. This produces doubled tokens deterministically when OpenCode sends both events. Treat as a known bug, not a hypothesis. Fix tracked in ticket 4.
- **StrictMode double-listener (frontend):** `useChat.ts:41-49` cancelled-flag guard does not survive React StrictMode's double-invoke. Two listener sets survive, doubling tokens independently of the Rust path. Fix tracked in ticket 4.
- Settings state can drift if frontend displays config defaults instead of backend-authoritative state.
- **`settingsStore.ts` does not exist** — ticket 3 lists it as `(if needed)`. Settings state is currently prop-drilled via `getConfig`/`updateConfig` IPC. Avoid creating a new store unless cross-cutting state is genuinely required.
- Focused E2E additions can become flaky if simulator mocks are overly coupled.
- **Simulator mock gaps block E2E test writing (ticket 5):** `mock-tauri.ts` always has `has_model: true`, blocking the required-model-picker path; `mock-opencode.ts` always reconnects on `init_opencode`, blocking disconnect-state E2E. Both must be made overrideable before E2E tests can be written.
- CI runtime can grow if workflow scope is not bounded.
- **`check.yml` already exists** — ticket 6 should extend it (add E2E job + xvfb), not recreate it.

## Out of Scope

- New provider integrations
- Large architectural refactors (e.g., full commands.rs split)
- Broad E2E suite stabilization unrelated to these sprint flows
