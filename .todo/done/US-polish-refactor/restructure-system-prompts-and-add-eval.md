# restructure-system-prompts-and-add-eval

## Context

The chat system prompt (`src/main/copilot/system-prompt.ts`) is a single 600-character run-on string. The monitor system prompt (`src/main/pulse/prompts.ts:8-20`) is slightly better-structured but still informal.

Two problems:

1. **Hard to maintain.** Adding a new constraint (e.g., "don't claim to have access to a tool you don't have") means editing prose. Models follow structured prompts more reliably than prose dumps.

2. **No regression protection.** The contrarian councillor's framing was sharpest: *"a 600-character English string is now load-bearing infrastructure for the core promise. What's the test that catches regressions when GitHub updates the model and your prompt suddenly produces tables/emojis? You need an eval, not vibes."*

The system prompt enforces several behaviors the product depends on:
- Never use markdown tables (chat panel is too narrow)
- Never use emojis (brand)
- Always use `set_attention_items` for work items
- Use specific Lucide icon names
- Format `openAction` correctly
- Be concise

A model update or prompt edit can silently break any of these. Today there's no test that catches it.

**Value delivered**: Prompts become maintainable structured documents. An eval harness ensures behavioral properties survive model and prompt changes.

## Related Files

- `src/main/copilot/system-prompt.ts` — chat prompt (1-line const)
- `src/main/pulse/prompts.ts` — monitor prompt + delta builder
- `src/main/__tests__/system-prompt.test.ts` — exists, currently tests presence-of-string only
- `src/main/__tests__/pulse-prompts.test.ts` — exists for delta builder
- `src/main/__tests__/evals/` — **new directory** to create

## Dependencies

- `decide-v1-mission-scope.md` (in US-v1-hardening) — if pull-only V1, monitor prompt section is dropped from this task

## Acceptance Criteria

**Restructure (required):**
- [ ] Chat prompt rewritten as structured markdown with clear sections:
  ```
  # Role
  ...
  # Tools available
  ...
  # When to use the attention panel
  ...
  # Output format
  ...
  # Constraints
  - Never use markdown tables
  - Never use emojis
  - Be concise
  ```
- [ ] Monitor prompt similarly restructured (if monitor session retained per scope decision)
- [ ] Prompts moved to dedicated `.md` files (`src/main/copilot/prompts/chat.md`, `monitor.md`) and imported as raw strings via Vite's `?raw` import or `fs.readFileSync` at startup. Rationale: editing prose in `.ts` string literals is painful; `.md` files render in editors, get syntax highlighting, are diffable.
- [ ] A small `loadPrompt(name)` helper handles the import. One source of truth.
- [ ] Existing tests updated; section-presence tests added (e.g., "chat prompt contains a `# Constraints` section listing 'no tables' and 'no emojis'")

**Eval harness (required):**
- [ ] New directory `src/main/__tests__/evals/` containing eval test files
- [ ] Eval framework: simple — each eval is a Vitest test that sends a real prompt to a real Copilot session (gated behind an env flag `RUN_EVALS=1` so it doesn't run in normal `just check`) and asserts properties of the response
- [ ] At minimum, evals for the chat prompt covering:
  - "List my next 3 meetings" → response does NOT contain markdown table syntax (`|---`)
  - "Summarize my day" → response does NOT contain any emoji (regex check against common emoji ranges)
  - "What's on my calendar?" → at least one `set_attention_items` tool call observed
  - "Show me a file path" → response uses inline code formatting (backticks)
- [ ] Evals run on demand via `just eval` (new just recipe) — NOT in CI by default (cost + flakiness)
- [ ] Eval results logged to `eval-results/<timestamp>.json` for tracking over time
- [ ] README section explaining how to run evals and what they protect

## Verification

**Automated (required for restructure):** existing prompt tests + new section-presence tests pass.

**Automated (required for eval):** `just eval` runs against real Copilot, produces a results file, exits non-zero if any eval fails.

**Ad-hoc:** read both restructured prompts. Confirm they're easier to edit than the originals. Make a sample edit (add a new constraint), confirm it's a localized change.

## Notes

- The eval harness is the more valuable half of this task. The restructure is hygiene; the eval is insurance.
- For V1, 4–6 evals is enough. Don't try to cover every prompt behavior.
- Eval results will be flaky at the edges (LLMs are nondeterministic). Keep assertions binary and obvious — "no table syntax" not "well-formatted response."
- Consider running each eval 3 times and requiring 2/3 to pass, to dampen single-run flakiness. Trade-off: 3x cost.
- Future enhancement: add evals for the monitor prompt (e.g., "given these attention items, propose updates that preserve unchanged ones"). Defer until monitor scope is settled.
- The `.md` import pattern: `import chatPromptRaw from "./prompts/chat.md?raw"` (Vite). For the main process which uses electron-vite, verify the equivalent works — fallback to `fs.readFileSync` at startup if needed.
