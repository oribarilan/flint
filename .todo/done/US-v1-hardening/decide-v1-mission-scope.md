# decide-v1-mission-scope

## Context

The council review surfaced a 2-2 split on the most consequential V1 question: **should the LLM-driven monitor session exist in V1, or should V1 be pull-only?**

- "Keep monitor" camp (claude, gpt): architecture is sound; reduce monitor authority by moving merge/policy into code; LLM proposes, deterministic logic reconciles.
- "Cut monitor" camp (simplifier, contrarian): autonomous LLM scheduler is speculative sophistication against fake data; ship the differentiated chat overlay first, earn the right to autonomy by validating pull experience; replace with a 60s deterministic `MeetingScheduler` (~150 LOC) for meeting alerts only.

The mission has silently drifted from "meeting alerts" (deterministic, tractable) to "surface what's important" (research project). README says one thing, specs say another, code does a third. A 600-character English string in `MONITOR_SYSTEM_PROMPT` is currently load-bearing infrastructure for the core promise.

Several downstream tasks depend on this decision:
- `fix-two-writer-attention-store.md` simplifies dramatically if pull-only (only one writer)
- `reset-monitor-on-model-change.md` becomes irrelevant if pull-only
- `wire-real-work-iq.md` shape changes (single NL tool vs narrow typed tools)
- The `pollFrequency` settings tab and Background Agent UI may be removed

**Value delivered**: Resolves the spec/code drift, unblocks downstream V1 hardening tasks, and locks in a defensible V1 promise the team can ship and validate.

## Related Files

- `README.md` — current mission statement (meeting-flavored)
- `docs/superpowers/specs/2026-04-23-desktop-assistant-design.md` — original spec (meeting-flavored)
- `docs/superpowers/specs/2026-04-25-background-intelligence-design.md` — Pulse spec (universal-attention-flavored)
- `src/main/pulse/scheduler.ts` — current monitor scheduler
- `src/main/copilot/sessions.ts` — monitor session creation
- `src/main/pulse/prompts.ts` — `MONITOR_SYSTEM_PROMPT`

## Dependencies

None. Should run first or in parallel with `verify-sdk-tool-restriction.md` and `lock-down-permissions.md`. Blocks `wire-real-work-iq.md`, `fix-two-writer-attention-store.md`.

## Acceptance Criteria

- [ ] Decision documented in a new file `docs/superpowers/specs/2026-XX-XX-v1-scope-decision.md` with: chosen path, rationale, rejected alternative + why, list of features in V1 vs deferred to V1.5/V2
- [ ] One of these three options is explicitly chosen:
  - **A: Pull-only V1** — delete `PulseScheduler`, monitor session, Background Agent settings tab. Ship chat overlay against real Work IQ. Notifications removed or replaced with a deterministic 60s timer for meetings only.
  - **B: LLM-monitor V1 (with guardrails)** — keep `PulseScheduler` and monitor session. Move merge/dedup/notification-threshold logic into code (`AttentionStore` becomes a state machine; LLM proposes candidates only). Single interval (no relaxed/normal/aggressive tiers).
  - **C: Hybrid** — deterministic `MeetingScheduler` (calendar-only, ~150 LOC) owns meeting cards and meeting notifications. LLM monitor optional, behind a settings flag, off by default. UI shows provenance per card ("from calendar" vs "AI suggested").
- [ ] README mission statement updated to match the chosen scope
- [ ] One of the two existing specs (`2026-04-23-desktop-assistant-design.md` or `2026-04-25-background-intelligence-design.md`) is marked as superseded; the other is updated to reflect the decision; or both are superseded by the new scope-decision spec
- [ ] Downstream tasks in this user story (`fix-two-writer-attention-store.md`, `wire-real-work-iq.md`) updated with notes about what they look like under the chosen path

## Verification

**Ad-hoc (decision task — automated test not applicable):**
- Open `README.md`, the new scope-decision spec, and the chosen-to-keep design spec. Confirm they tell the same story about V1 scope.
- Confirm no contradicting language remains (e.g., README mentioning meeting alerts while spec mentions Pulse).
- Re-read `main.md` of this user story and confirm the task list still makes sense under the chosen path; remove tasks that became irrelevant.

## Notes

- This is a product/architecture decision, not an implementation task. Time-box to 1–2 hours of writing + review.
- The council's tilt: pull-only is faster to ship and harder to mess up; LLM-driven is the differentiator. Hybrid (option C) preserves both but adds surface area.
- The author's actual usage matters most here. If you (the personal user of this personal tool) don't yet know whether you'd prefer ambient nudges or quiet-until-asked, default to pull-only — you can always add the monitor later, and you can never un-ship a noisy V1.
- After this task, `main.md` of `US-v1-hardening` should be revised to remove or reshape any tasks invalidated by the choice.
