# Attention Panel — Design Spec

## Overview

Replace the hardcoded meeting list in the left panel with a generic, agent-controlled "attention panel." The Copilot agent decides what items to show (meetings, Teams messages, emails, documents — anything from Work IQ) and pushes them via a `set_attention_items` tool. Each item renders as a uniform card with icon, title, description, select, and open actions.

This turns the left panel from a static meeting list into a dynamic, AI-curated surface where the agent surfaces what's relevant right now.

## Attention Item Data Model

```typescript
interface AttentionItem {
  id: string                  // Unique identifier
  icon: string                // Emoji or short string (📅 💬 📧 📄)
  title: string               // Primary text
  description: string         // Secondary text (time, sender, preview)
  openAction?: {
    type: 'url'
    url: string
  }
  metadata: Record<string, string>  // Context injected into chat on selection
}
```

`metadata` carries structured context the agent needs when the user selects the card. For a meeting: `{ type: "meeting", time: "2:00 PM", attendees: "Sarah, Mike", agenda: "Q4 review" }`. For a Teams message: `{ type: "teams_message", sender: "Jordan", channel: "Engineering" }`. The user never sees `metadata` directly — it's injected as a hidden system prefix when they send a chat message.

## Agent Tool

One tool: `set_attention_items`. Replaces the entire panel content.

```typescript
defineTool('set_attention_items', {
  description: 'Set the items shown in the attention panel. Replaces all current items.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            icon: { type: 'string', description: 'Emoji icon' },
            title: { type: 'string' },
            description: { type: 'string' },
            openAction: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['url'] },
                url: { type: 'string' },
              },
            },
            metadata: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['id', 'icon', 'title', 'description'],
        },
      },
    },
    required: ['items'],
  },
  handler: async (args) => {
    // Store items, push to renderer via IPC
    return 'ok'
  },
})
```

The agent calls this tool autonomously. For example, the monitor session's `report_meetings` tool handler can also call `set_attention_items` to push meeting data to the panel. The chat session's system prompt instructs the agent to update the panel when context changes.

## IPC

New/modified channels:

| Channel | Direction | Payload |
|---------|-----------|---------|
| `attention:update` | main → renderer | `AttentionItem[]` |
| `attention:get` | renderer → main | `→ AttentionItem[]` |
| `attention:open` | renderer → main | `{ id: string }` |

The existing `meetings:update` and `meetings:get` channels are removed — meetings flow through `attention:update` as `AttentionItem`s now.

## Selection & Context Injection

- User clicks "Select" on a card → card gets a visible checkmark/highlight
- Multiple cards can be selected simultaneously
- The chat input area shows a subtle indicator below the input: `With: Q4 Planning, Jordan's msg` (comma-separated titles of selected items)
- When the user sends a message, the selected items' `title`, `description`, and `metadata` are prepended as a hidden system prefix to the prompt:
  ```
  [Context — selected items:
  - 📅 Q4 Planning Review: 2:00 PM, Sarah, Mike, Lisa. type=meeting, time=2:00 PM
  - 💬 Jordan's message: "Are we still on for 3:30?". type=teams_message, sender=Jordan]

  <user's actual message>
  ```
- The user sees only their own message in the chat history. The context prefix is invisible.
- After sending, selection is NOT cleared — the user may want to ask follow-up questions about the same items.
- Deselect by clicking "Select" again on a selected card.

## UI Component: AttentionCard

Replaces `MeetingCards`. A generic card rendered in the left panel.

```
┌─────────────────────────────────┐
│ 📅  Q4 Planning Review         │
│     2:00 PM · Sarah, Mike, Lisa │
│              [Select] [Open ↗]  │
└─────────────────────────────────┘
```

- `icon` rendered at the left
- `title` bold, primary text
- `description` secondary text, can be multi-line, truncated at 2 lines
- "Select" button — toggles selection state. When selected: filled/highlighted style, checkmark icon
- "Open ↗" button — only shown when `openAction` is present. Calls `attention:open` IPC
- Selected cards get a left accent border or subtle background tint
- Cards are not clickable as a whole — only the explicit Select and Open buttons are interactive

## What Changes

| Current | New |
|---------|-----|
| `MeetingCards` component | `AttentionPanel` + `AttentionCard` components |
| `MeetingDetail` component | Removed (selection replaces detail view) |
| `meetingStore` (Zustand) | `attentionStore` (items + selectedIds) |
| `useMeetings` hook | `useAttention` hook |
| `meetings:update` IPC | `attention:update` IPC |
| `meetings:get` IPC | `attention:get` IPC |
| `meeting:join` IPC | `attention:open` IPC |
| `report_meetings` tool | Kept — but handler also calls `set_attention_items` to push to panel |
| `get_meetings` tool | Replaced by `get_attention_items` (reads from attention store) |
| `join_meeting` tool | Replaced by `open_attention_item` (generic open action) |
| `show_notification` tool | Kept as-is |
| `show_overlay` tool | Kept as-is |
| Chat `sendMessage` | Prepends hidden context from selected items before sending |

## What Stays

- Split layout (40% left, 60% right)
- Chat panel + input on the right
- Header (⚡ FLINT + settings)
- `set_attention_items` tool on the chat session (not monitor)
- Meeting monitor + cache in main process (feeds into attention panel via tool)
- Copilot SDK client, session management
- Config store, window management, tray, hotkey
- Settings UI

## System Prompt Update

The chat session system prompt needs to instruct the agent about the attention panel:

```
You are Flint, a personal work assistant. You have an attention panel on the left side of the interface where you can surface relevant items for the user.

Use set_attention_items to show meetings, messages, or other items that are relevant to the conversation. Each item has an icon, title, description, and optional open action.

When the user has items selected, their context will be provided. Use it to give contextually relevant answers.
```

## Error States

- **Empty panel**: Show "No items yet. Ask me about your day." with ⚡ icon
- **Agent pushes invalid items** (missing required fields): Filter them out, log warning
- **Open action fails**: Log error, show brief inline error on the card
