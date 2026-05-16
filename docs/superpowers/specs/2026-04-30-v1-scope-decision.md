# V1 Scope Decision: Pull-only

**Date:** 2026-04-30
**Status:** Active. Supersedes the LLM-monitor portions of `2026-04-23-desktop-assistant-design.md` and the entirety of `2026-04-25-background-intelligence-design.md`.
**Decided by:** US-v1-hardening review.

## Context

Flint's mission has silently drifted across three sources of truth:

- **README** described meeting-flavored alerts ("Stay on top of your work day — meeting alerts, calendar awareness").
- **`2026-04-23-desktop-assistant-design.md`** specified `MeetingMonitor` + `MeetingCache` polling the calendar every 15 min and alerting at 60s tick granularity.
- **`2026-04-25-background-intelligence-design.md`** introduced "Pulse" — an LLM-driven background agent (`PulseScheduler` + monitor session) that decides what's important across calendar, mail, and Teams via a 600-character English system prompt.
- **Code** implements Pulse against a 250-LOC fixture mock of `ask_work_iq` — neither real Work IQ data nor real meeting alerting works end-to-end.

A council review (4 LLMs) split 2-2 on whether the LLM-driven monitor session should ship in V1. The review surfaced concrete risks of shipping the autonomous variant: a two-writer race in `AttentionStore`, an unverified SDK tool perimeter, an unconfirmed `approveAll` policy that combines with prompt-injectable email content, and a 600-character English string acting as load-bearing infrastructure.

## Decision

**V1 is pull-only.** The LLM-driven monitor session is removed. Meeting alerts come from a small deterministic scheduler. Everything else happens when the user presses the hotkey.

### What ships in V1

1. **Hotkey-summoned overlay** with a chat session backed by the GitHub Copilot SDK and the real Work IQ MCP server.
2. **Attention panel** populated only by the chat session (in response to user questions). Single writer.
3. **Deterministic `MeetingScheduler`** (~150 LOC) — a 60s timer that queries Work IQ for the next ~24 hours of meetings on a low-frequency cadence (every 15 min), caches them in memory, and fires native OS notifications at the user-configured `alertMinutes` threshold before each meeting. No LLM in the alert path.
4. **Settings:** hotkey, theme, font size, alert minutes, launch-at-login, tray icon, model picker (chat session only).
5. **Connection status indicator** in the bottom bar.

### What is removed in V1

- `PulseScheduler` (`src/main/pulse/scheduler.ts`)
- Monitor session (`flint-monitor`) and all its plumbing in `SessionManager`
- `MONITOR_SYSTEM_PROMPT` and `src/main/pulse/prompts.ts`
- "Background Agent" settings card (toggle + frequency + poll model)
- `pollEnabled`, `pollFrequency`, `pollModel` config fields
- Monitor-only tools and the "owner" attribute discussion in the AttentionStore

### What is deferred to V1.5 / V2

- LLM-driven background monitoring of mail and Teams (re-evaluate after dogfooding pull-only)
- Autonomous notification policy (notifications about anything other than meetings)
- Per-card provenance UI (calendar vs AI-suggested)
- Cross-source attention items (only meetings + chat-driven items in V1)

## Rationale

**Why pull-only over LLM-monitor (option A over B):**

1. **Earn the right to autonomy.** The LLM-monitor is the differentiator, but it depends on a chat experience that hasn't been validated against real data. Ship the differentiated chat overlay first; layer autonomy once we know which signals matter.
2. **Smaller perimeter to harden.** The monitor session adds: a second `set_attention_items` writer (race condition), a second permission surface, a second model to keep in sync (`reset-monitor-on-model-change`), and a 600-char English string as policy. None of those need to ship in V1 to prove the product.
3. **Safer first impression.** "Noisy V1" is unrecoverable. A user whose first day with Flint includes spurious notifications about emails the LLM thought were urgent will not give it a second day. Quiet-until-asked is reversible — we can always add ambient nudges.
4. **Spec/code drift is real.** The current README, the original design spec, the Pulse spec, and the actual code each tell a different story. Cutting Pulse collapses three competing narratives into one.

**Why not hybrid (option C):**

The hybrid path (deterministic `MeetingScheduler` + optional LLM monitor behind a flag) preserves both surfaces. But the optional flag would either default to off (in which case it's unused and untested in V1) or default to on (in which case it ships and inherits all of B's hardening burden). Cleaner to defer the LLM monitor to V1.5 and add it back deliberately, with code-side merge logic, after pull-only is validated.

## Impact on US-v1-hardening tasks

| Task | Impact |
|---|---|
| `verify-sdk-tool-restriction` | Unchanged. Still required for the chat session. |
| `lock-down-permissions` | Unchanged. Still required for the chat session. |
| `wire-real-work-iq` | Reshaped: wire Work IQ MCP to the chat session only; drop monitor MCP plans. |
| `fix-two-writer-attention-store` | Simplified to "AttentionStore has a single writer (chat). Add `owner` field as future-proofing only if the design test shows it cleanly. Otherwise skip and revisit when V1.5 LLM monitor ships." |
| `reset-monitor-on-model-change` | **Removed.** No monitor session in V1. Chat-model reset is already handled by `resetChat`; verify `config:set` triggers it on `model` change as part of `validate-ipc-and-tool-output`. |
| `surface-connection-status` | Unchanged. Even more important now — without a background poll, the user has fewer ambient signals that the app is alive. |
| `fix-overlay-blur-hide`, `fix-chat-panel-scroll-deps`, `centralize-url-validation`, `validate-ipc-and-tool-output` | Unchanged. |

## Migration plan

The `pollEnabled` / `pollFrequency` / `pollModel` config fields will be removed via a config migration that drops the keys silently. No user-visible upgrade prompt — Flint has no real users yet.

Code removals:
- Delete `src/main/pulse/` directory
- Remove monitor session from `src/main/copilot/sessions.ts`
- Remove `MONITOR_*` constants and monitor session creation
- Remove "Background Agent" card from `src/renderer/src/components/Settings.tsx`
- Drop `pollEnabled`/`pollFrequency`/`pollModel` from `FlintConfig` + `DEFAULT_CONFIG`
- Add `src/main/scheduler/meeting-scheduler.ts` with the 60s deterministic timer

## Verification

This document is the source of truth for V1 scope. To verify the decision is honored:

- README reflects pull-only scope (meeting-flavored mission).
- The two superseded specs carry an explicit `**Status:** Superseded by 2026-04-30-v1-scope-decision.md` header.
- After hardening tasks complete, `src/main/pulse/` no longer exists.
- After hardening tasks complete, `npm run build && grep -r "MONITOR_SYSTEM_PROMPT" src/` returns nothing.
- `FlintConfig` no longer contains `pollEnabled` / `pollFrequency` / `pollModel`.

## Notes

- The author is a personal user of a personal tool. If, after dogfooding pull-only V1 for 2+ weeks, ambient nudges feel missing, V1.5 reintroduces the LLM monitor — but with code-side merge logic (`AttentionStore` as state machine, LLM proposes candidates only) per option B's guardrails.
- "Pull-only" does not mean "no notifications." Meeting alerts are pushed by the deterministic scheduler. The distinction is: deterministic code decides when to interrupt the user; the LLM never does.
