# AI-Driven Blocks

## Context

Wire Copilot tools to produce `FlintBlock` payloads that the renderer displays as visual blocks. Add a `show_meeting` tool that pushes a `MeetingCard` block. Update `join_meeting` to use meeting IDs (not raw URLs) and produce an `ActionConfirmation` block. Handle streaming + tool coexistence where blocks replace streamed text. Update the system prompt to prefer tool calls for meeting queries.

**Value delivered**: The AI produces visual blocks instead of plain text for meeting queries. Users see rich meeting cards and action confirmations instead of markdown.

## Related Files

- `src/main/copilot/tools.ts` — existing tool definitions (add `show_meeting`, update `join_meeting`)
- `src/main/copilot/system-prompt.ts` — system prompt (add tool-preference instructions)
- `src/main/copilot/sessions.ts` — session configuration (register new tools)
- `src/main/ipc/handlers.ts` — IPC handlers (emit `blocks:update`)
- `src/renderer/src/stores/chatStore.ts` — chat state (streaming integration with blocks)
- `src/renderer/src/stores/blockStore.ts` — block state (from task 2)
- `src/renderer/src/components/ChatPanel.tsx` — ChatMessage block rendering

## Dependencies

- `2-block-system.md` — block renderer, IPC channels, and block store must exist

## Acceptance Criteria

### Copilot Tools

- [ ] `show_meeting` tool defined: takes `{ meetingId: string }`, looks up meeting from in-memory cache, validates it exists, pushes `meeting-card` FlintBlock via `blocks:update` IPC
- [ ] `show_meeting` returns error string to AI if meeting not found in cache ("meeting not found")
- [ ] `join_meeting` updated: takes `{ meetingId: string }` (not raw URL), validates meeting exists in cache, validates `joinUrl` exists, pushes `action-confirmation` FlintBlock via `blocks:update`, then opens URL
- [ ] `join_meeting` returns error string if meeting not found or has no join URL
- [ ] Both tools explicitly registered in chat session config (no `--allow-all`)
- [ ] Tool parameter schemas use descriptive `description` fields so the AI knows when to call them

### ActionConfirmation Behavior

- [ ] `ActionConfirmation` block renders with pending → done status transition
- [ ] Auto-dismisses after 3s, returns to *previous* pill state (stored in blockStore)
- [ ] Auto-dismiss timer cancelled if user sends a new message
- [ ] Auto-dismiss timer cancelled on overlay hide
- [ ] Focus returns to chat input after auto-dismiss

### Streaming + Tool Coexistence

- [ ] Text streaming via `chat:delta` renders immediately as `ChatMessage` (pill in Chat state)
- [ ] If `blocks:update` arrives during active streaming, block replaces streamed text (pill morphs to block's state)
- [ ] If `chat:done` arrives with no blocks, streamed text stays as final `ChatMessage`
- [ ] New user message clears both streamed text and active block (return to streaming/waiting)

### System Prompt

- [ ] System prompt updated with tool-preference instructions: "When the user asks about a specific meeting, call show_meeting with the meeting ID. When the user wants to join a meeting, call join_meeting. Only use text responses when no tool fits the request."
- [ ] System prompt provides meeting context (IDs, titles) so the AI can match user queries to meeting IDs

### ChatMessage Block

- [ ] `ChatMessage` block renders markdown via existing `MarkdownContent` component
- [ ] Streaming content renders incrementally (same behavior as current chat, but in block form)

### Tests

- [ ] Unit tests for `show_meeting` tool handler: mock cache with meetings, verify `blocks:update` emission with correct `meeting-card` block
- [ ] Unit tests for `show_meeting` with missing meeting: verify error return
- [ ] Unit tests for `join_meeting` tool handler: mock cache, verify `action-confirmation` block + URL opening
- [ ] Unit tests for `join_meeting` with missing meeting / missing joinUrl: verify error returns
- [ ] Unit tests for streaming + block replacement logic in block store
- [ ] Unit tests for auto-dismiss timer (fires after 3s, cancelled on new message)
- [ ] Render tests for `ActionConfirmation` component (pending state, done state)
- [ ] Render tests for `ChatMessage` block with markdown content
- [ ] Existing tests pass (`just test`)

### Security

- [ ] `join_meeting` validates meeting ID exists in cache (no arbitrary URL opening from AI)
- [ ] `show_meeting` only returns data already in cache (no new network calls)
- [ ] Tool handlers validate input schemas; invalid calls return error strings to the AI

## Verification

- **Automated**: `just check` — lint, format, typecheck, and all tests pass
- **Ad-hoc**: `just dev` → summon overlay → type "tell me about my next meeting" → verify MeetingCard block appears in meeting-focus pill state
- **Ad-hoc**: Click "Join" suggestion chip on a meeting → verify ActionConfirmation appears, browser opens, confirmation auto-dismisses after 3s
- **Ad-hoc**: Type a generic question ("what's the weather?") → verify text streams as ChatMessage in chat pill state
- **Ad-hoc**: Type a meeting question, then immediately type a follow-up → verify block is cleared and new response streams

## Notes

- `show_meeting` needs access to the meeting cache. Pass it via the tool callbacks pattern already used in `createAllTools()`. Add an `onBlocksUpdate` callback alongside existing `onShowOverlay` and `onAttentionUpdate`.
- The system prompt needs to include current meeting context (IDs and titles from cache) so the AI can resolve "my next meeting" to a specific meeting ID. This context should be injected on each chat turn, not just at session creation. Consider a pre-send hook or context injection in the chat handler.
- `join_meeting` currently takes `{ joinUrl: string }`. Changing to `{ meetingId: string }` is a breaking change to the tool schema. The AI adapts to the new schema automatically via the tool definition, but update tests accordingly.
- Auto-dismiss timer: use `setTimeout` in the renderer (in a `useEffect` cleanup). Store `previousPillState` in blockStore before setting the ActionConfirmation block, so dismiss restores correctly.
- The `ChatMessage` block should look identical to the current chat assistant message styling. This is a re-container, not a redesign.
