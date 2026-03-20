# Sprint 02 — Theme Proposal

## Summary

Sprint 01 focused on making Agent mode reliable and testable. Sprint 02 should now choose a single clear theme so work stays coherent and shippable within one sprint. This proposal offers four distinct directions with different trade-offs in user value, risk, and engineering effort.

**Selected theme:** Direction D — Dev Velocity & Quality.

## Decisions

### Candidate Themes

| Direction                            | Primary Outcome                                                   | Best If You Want                           | Main Trade-off                                     |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| A — Search Core Excellence           | Faster, cleaner launcher search UX and safer search actions       | Immediate core product value for all users | Less net-new AI surface area                       |
| B — Cross-Platform Search Foundation | Real progress toward Windows/Linux parity                         | Strategic platform expansion now           | More infra work, less immediate UX payoff on macOS |
| C — Agent Power Features             | Richer AI interaction beyond reliability baseline                 | More depth in Agent mode quickly           | Larger UX scope + potential complexity             |
| D — Dev Velocity & Quality           | Faster iteration, stronger test confidence, lower regression risk | Team speed and stability as top priority   | Fewer visible end-user features this sprint        |

### Direction A — Search Core Excellence

Focus: tighten Flint’s launcher fundamentals (speed, relevance, safety, polish) on the two critical paths.

Suggested ticket set:

1. Search ranking and merge-order polish (apps/files/kits) with deterministic keyboard behavior.
2. In-flight query cancellation/debounce tuning to keep typing responsive under load.
3. Search settings cleanup to match current Spotlight-backed behavior.
4. Safety pass on destructive file actions (`validate_path_in_indexed_dirs` blast-radius guardrail).
5. Focused simulator E2E + unit regressions for search latency-sensitive flows.

### Direction B — Cross-Platform Search Foundation

Focus: establish backend abstraction and initial non-macOS search scaffolding.

Suggested ticket set:

1. Introduce platform search backend trait/interface (`macOS`, `windows`, `linux` modules).
2. Keep macOS Spotlight path as stable implementation.
3. Add Windows/Linux placeholder or minimal backend with clear capability flags.
4. Frontend messaging for unsupported/partial search capabilities per platform.
5. Cross-platform compile/test matrix hardening for backend separation.

### Direction C — Agent Power Features

Focus: move from “reliable chat” to “high-utility agent workflow.”

Suggested ticket set:

1. Rich message rendering pass (markdown/code blocks/copy affordances).
2. Tool-call timeline clarity (running/success/error, compact details).
3. Session UX enhancements (new-session affordance + clearer context boundaries).
4. Agent settings expansion for model/project-default discoverability.
5. Focused E2E for full ask→stream→tool-call→completion workflows.

### Direction D — Dev Velocity & Quality

Focus: reduce delivery friction and regression risk for subsequent feature sprints.

Suggested ticket set:

1. Simulator dev mode with real OpenCode backend proxy; test mode remains deterministic mocks.
2. Fill high-priority missing frontend component/hook tests.
3. Enforce practical coverage gates and add fast local “quick test” paths.
4. Split highest-risk oversized files (`commands.rs`, `kits/registry.rs`) to restore maintainability.
5. CI optimization for focused suites and reliable failure signals.

### Recommendation

Recommend **Direction D — Dev Velocity & Quality** as Sprint 02 (selected). Sprint 01 already invested in Agent reliability; this direction compounds that work by hardening simulator behavior, test coverage, and CI signal quality so follow-up feature sprints ship faster with lower regression risk.

If priorities shift toward immediate end-user launcher UX improvements, Direction A is the strongest next alternative.

## Implementation

After theme selection:

1. Create `.todo/sprint02/master.md` with sequence, dependencies, and Definition of Done.
2. Create 4–6 numbered ticket files under `.todo/sprint02/`.
3. Map each ticket to tests (unit + focused simulator E2E).
4. Add explicit critical-path guardrails per ticket.

## Notes

- This file is a planning proposal only; no execution is implied yet.
- If the selected direction conflicts with `spec.md` or `specs/design.md`, raise a review checkpoint before implementation.
