# US-polish-refactor

## Goal

Improve code organization, prompt maintainability, and UI clarity once V1 hardening (`US-v1-hardening`) is complete. None of these tasks block V1 shipping, but each addresses code-organization smells or UX details that the council called out as future maintenance hazards.

Source: comprehensive multi-LLM council review (2026-04-30). All P2 items live here. The split rule with `US-v1-hardening`: anything that affects security, correctness, real-data flow, or critical UX (blur footgun) is hardening; anything that's "this will be hard to maintain in 6 months" is polish.

## Definition of Done

- [ ] No file in `src/main/` or `src/renderer/src/` exceeds 300 LOC (per AGENTS.md guideline of <500 LOC, but tighter for the known hot spots)
- [ ] System prompts (chat + monitor) are structured markdown with clear sections, not 600-char wall-of-text strings
- [ ] An eval harness exists for system prompts so model/SDK updates don't silently regress prompt behavior
- [ ] Settings UI is reduced to one scrollable pane OR retains tabs only if the count of settings justifies it
- [ ] Keyboard navigation hook is decomposed into single-responsibility hooks, each <100 LOC
- [ ] App.tsx focus orchestration no longer relies on `pendingFocusRef` — focus intent is owned by one piece of state

## Task Priority

These tasks are independent and can run in any order after `US-v1-hardening` lands. Recommended sequence based on leverage:

1. `decompose-use-keyboard-nav.md` — easiest to test in isolation; sets the pattern for other refactors
2. `restructure-system-prompts-and-add-eval.md` — protects all future prompt changes from silent regressions
3. `simplify-app-focus-orchestration.md` — removes a code smell that will produce focus bugs at the seams
4. `collapse-or-justify-settings-tabs.md` — UX clarity + LOC reduction
5. `decompose-tools-module.md` — separates tool definitions from mock/fixture data and side-effect handlers

## Cross-Cutting Concerns

**Refactor without behavior change.** Each task in this story should be a structural improvement with zero user-facing change (with the exception of `collapse-or-justify-settings-tabs.md` which is intentionally a UX change). Existing tests must continue to pass; new tests strengthen the structural guarantees.

**Don't refactor what might be deleted.** If `decide-v1-mission-scope.md` (in `US-v1-hardening`) chose pull-only V1, then `restructure-system-prompts` only needs to cover the chat prompt; the monitor prompt is gone. Re-evaluate this story's tasks after the scope decision lands.

**Test-first for refactors.** Each refactor task starts by adding/strengthening tests for current behavior, THEN restructures. The test suite is the safety net.

## Source

Council review synthesis: 4 councillors flagged code-organization concerns. Unanimous on `useKeyboardNav` decomposition (225 LOC, one effect, deep branching). Unanimous on `App.tsx` focus orchestration smell. Contrarian was strongest on the eval-harness gap. Simplifier was strongest on settings collapse.
