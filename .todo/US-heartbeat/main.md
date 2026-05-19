# US-heartbeat

## Goal

Add a background AI heartbeat that periodically queries the Copilot SDK to generate meeting prep and surface proactive alerts, layered alongside the existing deterministic MeetingScheduler.

## Context

V1 shipped pull-only (no LLM-driven background monitor). The MeetingScheduler handles deterministic timing for alerts, spotlight, and prep callbacks, but the `onPrepare` callback is stubbed --- it caches an empty array and the AI never generates any content. The spotlight always shows "Preparing meeting context..." and the `show_meeting` tool never attaches `aiPrep` data.

This story introduces a Heartbeat module that owns a `flint-monitor` Copilot session, runs every 10 minutes, and generates meeting prep + proactive notifications. The scheduler handles *when* to interrupt; the heartbeat handles *what* to say.

## Architecture

```
MeetingScheduler (timing)              Heartbeat (content)
-- polls meetings every 15min          -- beats every 10min
-- ticks every 60s                     -- owns flint-monitor session
-- fires onPrepare at (spot+5)min      -- generates meeting prep -> prepCache
-- fires onSpotlight at spotMin        -- fires proactive notifications
                                       -- has Work IQ MCP access
onPrepare checks prepCache:
  data exists -> done
  no data -> triggers heartbeat.prepMeeting() on-demand
```

Shared state: `prepCache` (extracted to its own module, read by spotlight window and show_meeting tool).

## Guardrails

- Beat overlap prevention (boolean lock, skip if still running)
- prepCache cleanup (remove entries for past meetings on each beat)
- Pause when CopilotManager is disconnected, beat on reconnect
- Overlay focus freeze (pause beats while overlay focused, resume on blur, deferred beat fires)
- Max 5 consecutive failures stops the timer (restarts on resume/reconnect)
- 90s timeout per beat

## Definition of Done

- [ ] Heartbeat generates real prep content (3-5 bullets) for meetings within 30 minutes
- [ ] Spotlight window shows prep content instead of "Preparing meeting context..."
- [ ] `show_meeting` tool attaches `aiPrep` from prepCache when available
- [ ] Proactive notifications fire for conflicts, back-to-backs, agenda-less meetings
- [ ] Guardrails work: overlap prevention, failure limit, focus freeze, cleanup
- [ ] Config: `heartbeatEnabled` toggle (default true) with migration
- [ ] All new modules have unit tests
- [ ] `just check` passes (lint + format + typecheck + test)

## Task Priority

1. `1-prep-cache.md` -- extract prepCache to shared module (unblocks everything)
2. `2-config.md` -- add heartbeatEnabled to FlintConfig
3. `3-prompt-and-builder.md` -- system prompt + prompt builder
4. `4-monitor-tools.md` -- cache_meeting_prep tool + permissions
5. `5-heartbeat-module.md` -- core heartbeat with guardrails
6. `6-wiring.md` -- wire heartbeat in index.ts, power management, focus freeze
7. `7-fix-show-meeting.md` -- attach aiPrep from prepCache

## Cross-Cutting Concerns

- The heartbeat session is independent from the chat session. Both use the same CopilotClient but different session IDs.
- prepCache is the shared data bridge between heartbeat (writer), spotlight window (reader), and show_meeting tool (reader).
- The heartbeat does NOT use `set_attention_items` --- that stays single-writer (chat only) per V1 scope decision. Proactive output is notifications only.
- Follow existing patterns: factory functions, `?raw` prompt imports, Zod validation, permission policy.
