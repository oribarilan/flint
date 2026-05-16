# wire-real-work-iq

## Context

`ask_work_iq` in `src/main/copilot/tools.ts:36-209` is a 250-LOC hand-rolled mock returning fixture data for calendar/email/Teams queries. Every attention card, every notification decision, every chat answer about M365 data is currently theater. Until real Work IQ MCP is wired, the entire product is a polished demo.

The spec (`docs/superpowers/specs/2026-04-23-desktop-assistant-design.md`) calls for:
```typescript
mcpServers: {
  "work-iq": {
    type: "local",
    command: "npx",
    args: ["-y", "@microsoft/workiq", "mcp"],
    tools: ["*"],
  },
}
```

Two open questions to resolve as part of this task:
1. **Single NL tool vs narrow typed tools.** Work IQ's published shape is one black-box `ask_work_iq(question)` tool. The council recommended splitting into 3-5 narrow tools (`get_upcoming_meetings`, `get_recent_emails_since`, `get_teams_messages_since`) so that delta detection has structure. Determine whether this is achievable — either Work IQ exposes them, or we wrap `ask_work_iq` in narrower tool definitions whose handlers compose deterministic NL queries.
2. **One MCP server or two.** If both chat and monitor sessions need Work IQ, do we spawn two `npx workiq mcp` subprocesses (one per session, per the SDK's MCP-per-session model) or share one. Implications for auth, performance, and process lifecycle.

**Value delivered**: Real M365 data on screen. The product becomes the product. Foundational truth gap closed.

## Related Files

- `src/main/copilot/tools.ts:36-209` — to delete (or move to test fixtures)
- `src/main/copilot/sessions.ts:73-90` — monitor session needs `mcpServers` config added
- `src/main/copilot/sessions.ts:45-71` — chat session: decide if it also gets Work IQ MCP, or only reads from `AttentionStore` (per original spec)
- `AGENTS.md` — Work IQ MCP reference section
- `package.json` — `@microsoft/workiq` may need to be a dependency

## Dependencies

- `decide-v1-mission-scope.md` (P0) — determines whether monitor session exists in V1
- `verify-sdk-tool-restriction.md` (P0) — perimeter must be confirmed before letting an external MCP server in

## Acceptance Criteria

- [ ] `@microsoft/workiq` added to `package.json` dependencies (or confirmed as already-available CLI per Copilot SDK conventions)
- [ ] Mock `ask_work_iq` removed from `src/main/copilot/tools.ts`. The 250 LOC of fixtures either deleted or moved to `src/main/__tests__/fixtures/workiq-mock.ts` for use by integration tests only
- [ ] Monitor session (and chat session, if scope decision includes it) configured with `mcpServers: { "work-iq": { type: "local", command: "npx", args: ["-y", "@microsoft/workiq", "mcp"], tools: ["*"] } }`
- [ ] On a developer machine with `workiq accept-eula` completed, app start triggers a bootstrap poll that returns at least one real meeting from the user's actual calendar (verified by inspecting the attention panel)
- [ ] Decision documented in code (a comment in `sessions.ts` or a dedicated short doc): single NL tool vs narrow typed tools, with rationale
- [ ] Decision documented in code: shared MCP subprocess vs per-session, with rationale  
- [ ] Error path: if `workiq accept-eula` has NOT been run, the app surfaces a clear inline message ("M365 not connected — run `workiq accept-eula` to set up") in the empty attention panel state, NOT a silent failure
- [ ] Existing `__tests__/copilot-sessions.test.ts` updated: tests must mock the Work IQ MCP boundary (not real network calls)
- [ ] `tools: ["*"]` is intentional and reviewed against the security model (`lock-down-permissions.md`) — Work IQ MCP tools are auto-approved, but document why this is acceptable (read-only M365 data access)

## Verification

**Ad-hoc (required for end-to-end proof):**
- Run `just dev` on a machine with completed `workiq accept-eula`. Hit the hotkey. Within ~90 seconds, real meetings from your actual calendar appear in the attention panel.
- Same flow on a machine WITHOUT `workiq accept-eula`. Confirm the empty state shows a setup prompt, not "No items yet."

**Automated (required for regression protection):**
- Integration test in `src/main/__tests__/copilot-sessions.test.ts` mocking the MCP subprocess and asserting the monitor session correctly invokes Work IQ tools and feeds results into `set_attention_items`.

## Notes

- This is the council's #1 unanimous P0 along with SDK lockdown. Everything downstream (testing, UX validation, dogfooding) is gated on this.
- The `tools: ["*"]` in the MCP config is at the MCP-protocol level (which Work IQ tools the model can call). Do not confuse with Copilot SDK's built-in tool restriction — those are independent perimeters.
- If the narrow-tools-vs-NL-blackbox question can't be answered without spike work, do the spike. Time-box to half a day. Worst case, ship with single `ask_work_iq` and split in a follow-up task.
- If scope decision was "pull-only V1" without monitor session, this task becomes: wire Work IQ to the chat session only, drop monitor MCP config entirely.
