# system-prompt

## Context

The Copilot agent currently has no formatting instructions. It produces unstructured plain text and sometimes uses emojis. This task updates the system prompt to instruct the agent to use markdown formatting for readability and never use emojis.

**Value delivered**: Agent responses become well-structured immediately — bold for emphasis, headers for sections, lists for scanability. Even before the renderer supports markdown, the raw markdown syntax is more readable than unformatted walls of text.

## Related Files

- `src/main/index.ts` — line 93-95, `systemMessage.content` in the chat session `createSession` call

## Dependencies

- None

## Acceptance Criteria

- [x] System prompt string is extracted to a named constant (e.g., `CHAT_SYSTEM_PROMPT`) in a dedicated module so it can be imported and tested
- [x] System prompt includes instruction to use markdown formatting (bold, italic, headers, lists, code blocks) for readability
- [x] System prompt includes instruction to never use emojis
- [x] Existing system prompt content (Work IQ, attention panel, set_attention_items, conciseness) is preserved — append, don't replace
- [x] `src/main/index.ts` imports the constant instead of using an inline string
- [x] Unit test imports the constant and asserts it contains both formatting and no-emoji instructions

## Verification

- **Automated**: Unit test asserting system prompt string contains "markdown" and "emoji" instructions
- **Ad-hoc**: `just check` passes. Manual: send a prompt in dev mode, confirm agent responds with markdown structure and no emojis.

## Notes

Append to the end of the existing system prompt. Keep it concise — one or two sentences. Suggested wording:

> "Format your responses using markdown for readability — use bold, italic, headers, lists, and code blocks to make information scannable. Never use emojis."
