# US-dynamic-island

## Goal

Replace Flint's fixed 340×480 overlay with a Fluid Pill — a shape-shifting container that morphs its width, height, and border-radius to match the content. The AI composes visual blocks (meeting cards, action confirmations) instead of defaulting to chat text. Chat text is the fallback, not the primary response mode.

Scoped to calendar + meetings per V1 scope decision. Email, Teams, and document blocks are deferred.

Reference showcase: `showcases/dynamic-island-showcase.html` (Variant A).

## Design Spec

### Container Morphing

The pill is a CSS-rendered shape inside the existing transparent frameless Electron window. The window stays at a fixed max size (360×600). Transparent areas must be click-through (see Click-Through Strategy).

| State | Width | Border Radius | Derived From |
|-------|-------|---------------|--------------|
| Briefing | 320px | 28px | No AI block active (default) |
| Meeting Focus | 320px | 24px | `meeting-card` block |
| Action Confirm | 280px | 40px | `action-confirmation` block |
| Chat | 340px | 22px | `chat-message` block or active streaming |

Height is content-driven, max ~540px (600px window minus padding). Content exceeding max height scrolls internally (`overflow-y: auto`, `overscroll-behavior: contain`).

All dimension changes animate with `cubic-bezier(0.16, 1, 0.3, 1)` over 450ms.

### State Machine

Pill state is derived, not stored. A pure function of the current block stack:

```typescript
type PillState = 'briefing' | 'meeting-focus' | 'action-confirm' | 'chat';

function derivePillState(activeBlock: FlintBlock | null, isStreaming: boolean): PillState {
  if (isStreaming && !activeBlock) return 'chat';
  if (!activeBlock) return 'briefing';
  switch (activeBlock.type) {
    case 'meeting-card': return 'meeting-focus';
    case 'action-confirmation': return 'action-confirm';
    case 'chat-message': return 'chat';
    default: return 'briefing';
  }
}
```

Legal transitions: any state to any state. No restricted transitions. The animation system handles all morphs uniformly.

### Block System

The renderer uses a library of typed React components (blocks) for all content. Two sources:

1. **Cache-derived blocks** — the renderer composes `MeetingList`, `AttentionList`, and `SuggestionChips` from existing Zustand stores on overlay show. Zero network, zero disk. This is the briefing view.
2. **AI-produced blocks** — the main process pushes blocks via `blocks:update` when the AI calls a tool. These overlay the briefing with focused content.

### Block Contract

```typescript
type FlintBlock =
  | { type: 'meeting-list'; data: Meeting[] }
  | { type: 'meeting-card'; data: MeetingCardData }
  | { type: 'attention-list'; data: AttentionItem[] }
  | { type: 'action-confirmation'; data: ActionConfirmData }
  | { type: 'chat-message'; data: { role: 'assistant'; content: string } }
  | { type: 'suggestion-chips'; data: SuggestionChip[] };

interface MeetingCardData {
  id: string;
  title: string;
  startTime: string;       // ISO 8601
  endTime: string;
  attendees: string[];
  organizer: string;
  joinUrl?: string;
  agenda?: string;
  isAllDay?: boolean;
  aiPrep?: string[];        // AI-generated preparation notes
}

interface ActionConfirmData {
  action: string;            // e.g. 'join_meeting'
  label: string;             // e.g. 'Joining Q4 Planning...'
  status: 'pending' | 'done';
}

interface SuggestionChip {
  label: string;             // display text
  prompt: string;            // sent to chat:send on click
}
```

All blocks received via IPC are validated with Zod schemas before rendering. Invalid blocks are dropped with structured `[blocks]` log warnings. The renderer falls back to briefing if all blocks in an update are invalid.

### Block Components

| Block | Data Source | Usage |
|-------|-----------|-------|
| `MeetingList` | Cache (meeting store) | Compact meeting rows in briefing |
| `MeetingCard` | AI tool call | Single meeting focus view |
| `AttentionList` | Cache (attention store) | Attention items in briefing |
| `ActionConfirmation` | AI tool call | Compact transient feedback |
| `ChatMessage` | Streaming text fallback | Markdown text |
| `SuggestionChips` | Hardcoded per pill state | Contextual prompts above input |

### Block Lifecycle

- **Briefing blocks**: composed by renderer from cache on every overlay show. Not cleared by AI blocks — they're the base layer.
- **AI-produced blocks**: pushed via `blocks:update`, replace any previous AI block. Only one AI block is active at a time.
- **Clear on**: new user message sent (return to streaming/waiting state), overlay hidden (full reset).
- **ActionConfirmation auto-dismiss**: after 3s, returns to *previous* pill state (not always briefing). Timer cancelled if user sends a new message or interacts.

### How the AI Produces Blocks

Copilot session tool calls emit blocks. The AI calls tools like `show_meeting(id)` and `join_meeting(id)` that return structured data. The tool handler on the main process validates the data, constructs a `FlintBlock`, and pushes it via `blocks:update`.

If the AI responds with plain text (no tool call), the renderer wraps the streamed text in a `ChatMessage` block.

### Streaming + Tool Coexistence

Within a single AI turn:

1. Text streams in via `chat:delta` and renders immediately as a `ChatMessage` (pill in Chat state).
2. If `blocks:update` arrives (from a tool call in the same turn), the block **replaces** the streamed text. The pill morphs to the block's state.
3. If `chat:done` arrives with no blocks, the streamed text stays as the final `ChatMessage`.

The system prompt instructs the AI to prefer tool calls over text narration. In practice, tool calls fire before text streaming begins, so the replacement transition is rare.

### Transition Animations

- Container morph (width + border-radius): 450ms, `cubic-bezier(0.16, 1, 0.3, 1)`
- Content out: fade 150ms, `cubic-bezier(0.7, 0, 0.84, 0)`
- Content in: fade + translateY(8px) over 250ms, `cubic-bezier(0.25, 1, 0.5, 1)`, 50ms stagger between blocks
- Action auto-dismiss: returns to previous state after 3s
- Reduced motion: all durations to 0.01ms

### Input & Suggestion Chips

The pill-shaped input sits at the bottom of the pill in every state. Suggestion chips above it are **hardcoded per pill state** (not AI-generated):

- **Briefing**: "What's next?", "Prep for next meeting"
- **Meeting Focus**: "Join", "Prep notes", "Back"
- **Chat**: (none)
- **Action Confirm**: (none — transient)

Clicking a chip sends its `prompt` string to `chat:send`. "Back" clears the active AI block (return to briefing). "Join" sends a `blocks:action` with the meeting's join URL.

### IPC Changes

New channels (additive — existing channels unchanged):

| Channel | Direction | Payload |
|---------|-----------|---------|
| `blocks:update` | main → renderer | `FlintBlock` (single block, replaces previous) |
| `blocks:action` | renderer → main | `{ type: string; payload: Record<string, string> }` |

**`blocks:action` allowlist**: only `join`, `dismiss`, and `open` are valid action types. The main process rejects unknown types with structured logging. `join` validates the URL against cached meeting data before opening.

### Relationship to Existing Channels

- `attention:update` continues to push `AttentionItem[]` into the attention Zustand store. The briefing view reads from this store to compose `AttentionList` blocks. No deprecation.
- `chat:delta` / `chat:done` remain the text streaming path. The block system is a parallel visual layer, not a replacement.

### Window Changes

Electron overlay window max size increases from 340×480 to 360×600. The pill is centered within the transparent window. Pill shadow and background are CSS; the window itself is transparent.

### Click-Through Strategy

Transparent areas outside the pill must not intercept mouse events. Approach: `setIgnoreMouseEvents(true, { forward: true })` with CSS `pointer-events: none` on the transparent container and `pointer-events: auto` on the pill itself.

**This needs a spike.** Electron's click-through behavior is platform-dependent. If the spike reveals issues on macOS, the fallback is dynamically resizing the BrowserWindow to match pill dimensions (reliable but adds complexity).

### Error States

| Condition | Pill Behavior |
|-----------|--------------|
| Copilot disconnected | Briefing renders from cache. Chat input shows "Reconnecting..." placeholder. |
| Tool call fails | `ChatMessage` with "Something went wrong. Try again." |
| Invalid block payload | Block dropped with structured `[blocks]` log. Renderer stays in current state. |
| Work IQ auth expired | Attention items stale. No change to pill. Status via ConnectionDot. |

## Definition of Done

- [ ] Overlay renders as a morphing pill with width/radius adapting per PillState
- [ ] Pill state derived from active block type via `derivePillState`
- [ ] Briefing composes MeetingList + AttentionList + SuggestionChips from cache (zero network/disk)
- [ ] `FlintBlock` discriminated union types defined with Zod validation schemas
- [ ] `blocks:update` IPC channel delivers validated FlintBlock payloads to renderer
- [ ] `blocks:action` IPC channel delivers allowlisted actions from renderer to main
- [ ] When AI calls `show_meeting`, a MeetingCard block renders in meeting-focus pill state
- [ ] When AI calls `join_meeting`, an ActionConfirmation block renders and auto-dismisses after 3s
- [ ] Unmatched AI queries fall back to ChatMessage block (streamed markdown)
- [ ] Blocks replace streamed text when a tool call arrives in the same turn
- [ ] Content scrolls internally when exceeding max pill height
- [ ] All state transitions animate with spec'd easing and timing
- [ ] `prefers-reduced-motion` collapses all animations to 0.01ms
- [ ] Keyboard accessible: Tab between chips, Enter to activate, Escape to dismiss
- [ ] Focus returns to chat input after ActionConfirmation auto-dismiss
- [ ] Error states handled gracefully (disconnected, failed tool call, invalid block)
- [ ] Existing unit tests pass; new blocks and state derivation have unit tests
- [ ] No performance regression on overlay-ready path (hotkey → visible → briefing from cache → input focused)
- [ ] Click-through works on transparent areas (or fallback window resize implemented)

## Cross-Cutting Concerns

- **Performance**: The overlay-ready path must remain zero-network, zero-disk. Briefing blocks are composed by the renderer from existing Zustand stores — not fetched from AI or main process.
- **Backward compatibility**: Existing IPC contract stays. New `blocks:*` channels are additive.
- **Block extensibility**: Adding a new block type = React component + type in the discriminated union + Zod schema + Copilot tool. No changes to the block registry or rendering infrastructure.
- **Copilot tool scoping**: New tools (`show_meeting`, `join_meeting` update) explicitly registered. No `--allow-all`.
- **Security**: `blocks:action` payloads are allowlisted. `join_meeting` validates URLs against cached meeting data. No arbitrary URL opening from renderer.

## Task Priority

Sequential — each task depends on the previous:

1. `1-pill-container.md` — Morph overlay from fixed rectangle to animated pill
2. `2-block-system.md` — Block wire format, registry, renderer, and IPC infrastructure
3. `3-ai-blocks.md` — Copilot tools that produce blocks, streaming coexistence
