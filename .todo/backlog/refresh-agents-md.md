# refresh-agents-md

## Context

`AGENTS.md` was written when the architecture included an LLM-driven `MeetingMonitor`, an in-memory `MeetingCache`, `meetings:*` IPC channels, and React `MeetingCards` / `MeetingDetail` components. Under the **pull-only V1** scope decision (`docs/superpowers/specs/2026-04-30-v1-scope-decision.md`), all of those have been deleted or replaced:

- The `MeetingMonitor` LLM session is gone; deterministic `MeetingScheduler` (`src/main/scheduler/meeting-scheduler.ts`) replaced it
- `MeetingCache` doesn't exist — the scheduler holds its own dedupe state
- `meetings:update`, `meetings:get`, `meeting:join` IPC channels are not in `IPC_CHANNELS`
- `MeetingCards` / `MeetingDetail` components were never built (or were removed) — the UI is the AttentionPanel + ChatPanel
- The actual IPC surface includes `attention:update`, `attention:open`, `connection:status`, `link:open`, `model:*`, `chat:reset`, `theme:changed`, etc., none of which are documented in AGENTS.md

This drift means a new agent reading AGENTS.md will form a wrong mental model of the system before writing a single line of code. That's a recipe for bad PRs.

`US-v1-hardening`'s main.md (Open Items #4) explicitly recommended this task.

**Value delivered**: AGENTS.md accurately describes the V1 architecture, IPC contract, and component layout. New AI/human contributors form correct mental models from first read.

## Related Files

- `AGENTS.md` — to refresh
- `src/main/ipc/channels.ts` — source of truth for IPC channel names
- `src/main/index.ts` — actual main-process composition
- `src/main/scheduler/meeting-scheduler.ts` — replaces references to MeetingMonitor/Cache
- `src/renderer/src/components/` — actual component list (no MeetingCards/MeetingDetail)
- `docs/superpowers/specs/2026-04-30-v1-scope-decision.md` — scope decision driving the architecture
- `.todo/done/US-v1-hardening/main.md` — historical context for what changed

## Dependencies

None.

## Acceptance Criteria

- [ ] AGENTS.md "Architecture" diagram replaced with a current one. Specifically:
  - Remove `MeetingMonitor`, `MeetingCache` from the main-process box
  - Add `MeetingScheduler` (deterministic, no LLM)
  - Remove `MeetingCards`, `MeetingDetail` from the renderer box
  - Add `AttentionPanel`, `ConnectionDot`, `ChatPanel`, etc. (whatever the real component tree shows)
  - Reflect that there's only **one** Copilot SDK session (chat), not two
- [ ] AGENTS.md "IPC Contract" table updated to reflect actual channels in `src/main/ipc/channels.ts`. Remove `meetings:*` rows. Add `attention:*`, `connection:status`, `link:open`, `model:*`, `chat:reset`, `theme:changed`, `overlay:hide`. Each row's payload must match the actual handler signature.
- [ ] AGENTS.md "Performance-Critical Paths" section updated:
  - Path 1 ("overlay ready") — remove "meeting cards rendered from cache"; describe the actual ready state (attention items rendered from store, input focused)
  - Path 2 ("streaming response") — verify it still matches reality
- [ ] AGENTS.md mentions the per-tool permission policy and `availableTools` allow-list (added in `US-v1-hardening`) under the Security section
- [ ] AGENTS.md mentions zod schemas at trust boundaries (`FlintConfigSchema`, `AttentionItemSchema`, `ChatSendPromptSchema`) under Security or TypeScript Conventions
- [ ] No reference to `flint-monitor`, `MeetingMonitor`, `MeetingCache`, `MeetingCards`, `MeetingDetail`, or `meetings:*` IPC remains anywhere in AGENTS.md
- [ ] The "Tech Stack" and "Commands" sections are spot-checked and either confirmed correct or updated

## Verification

**Ad-hoc (required):**
- `rg -n "MeetingMonitor|MeetingCache|MeetingCards|MeetingDetail|meetings:|flint-monitor" AGENTS.md` returns zero matches.
- For every row in the updated IPC Contract table, `rg "<channel-name>" src/main/ipc/` confirms the channel actually exists with that direction and payload.
- Read AGENTS.md top-to-bottom; the architecture section matches what `src/main/index.ts` actually composes.

**Automated (optional):**
- Could add a tiny script in `scripts/` that diffs the documented IPC channels against `IPC_CHANNELS` keys and fails on mismatch. Worth proposing if drift recurs; don't build it speculatively in this task.

## Notes

- **Use the `devdoc` skill** for this task (per AGENTS.md guidance on documentation work).
- Keep the file's tone, structure, and section ordering. This is a refresh, not a rewrite.
- If sections feel newly redundant with `docs/superpowers/specs/2026-04-30-v1-scope-decision.md`, link to the spec rather than duplicating content.
- The "Copilot SDK Reference" cookbook section at the bottom is still valid — leave it alone unless something there is provably wrong.
- If you discover other stale references during the pass (e.g., outdated cookbook links, old session names, removed env vars), fix them as part of this task — it's all the same "refresh" deliverable.
