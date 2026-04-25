# tool-icon-names

## Context
Update the `set_attention_items` Copilot tool description and system prompt to reference Lucide icon names instead of emoji characters.

**Value delivered**: The AI agent sends valid Lucide icon names, ensuring SVG icons render correctly.

## Related Files
- Modify: `src/main/copilot/tools.ts` (tool description)
- Modify: `src/main/index.ts` (system prompt)
- Modify: `src/main/__tests__/copilot-tools.test.ts` (test data)

## Dependencies
- `attention-icons.md` (renderer must handle icon names before agent starts sending them)

## Acceptance Criteria
- [ ] `set_attention_items` tool icon description says "Lucide icon name: calendar, message-circle, mail, file-text"
- [ ] System prompt references icon names instead of emoji
- [ ] Test data uses icon name strings instead of emoji characters
- [ ] `just test` passes

## Verification
- `just test` passes
- Grep for emoji characters (📅💬📧📄) in `src/main/` returns zero results
