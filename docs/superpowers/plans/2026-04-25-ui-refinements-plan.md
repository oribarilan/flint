# UI Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four UI improvements — chat auto-scroll, Lucide SVG icons, bottom bar, click-to-select cards.

**Architecture:** Each change is localized to 1-3 renderer components. The Lucide icon system is the only shared dependency (used by tasks 2, 4, and 5). Task 3 (auto-scroll) is fully independent.

**Tech Stack:** React 19, Zustand 5, lucide-react, Vitest, CSS Modules

**Spec:** `docs/superpowers/specs/2026-04-25-ui-refinements-design.md`

---

### Task 1: Install lucide-react and create icon mapping

**Files:**
- Create: `src/renderer/src/components/AttentionIcon.tsx`
- Create: `src/renderer/src/components/__tests__/AttentionIcon.test.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install lucide-react**

```bash
npm install lucide-react
```

- [ ] **Step 2: Write failing tests for the icon mapping component**

Create `src/renderer/src/components/__tests__/AttentionIcon.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AttentionIcon } from '../AttentionIcon'

describe('AttentionIcon', () => {
  it('renders calendar icon for "calendar" name', () => {
    const { container } = render(<AttentionIcon name="calendar" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders message-circle icon for "message-circle" name', () => {
    const { container } = render(<AttentionIcon name="message-circle" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders mail icon for "mail" name', () => {
    const { container } = render(<AttentionIcon name="mail" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders file-text icon for "file-text" name', () => {
    const { container } = render(<AttentionIcon name="file-text" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('renders fallback circle icon for unknown name', () => {
    const { container } = render(<AttentionIcon name="unknown-thing" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('passes size prop to the SVG', () => {
    const { container } = render(<AttentionIcon name="calendar" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('20')
    expect(svg?.getAttribute('height')).toBe('20')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
just test
```

Expected: FAIL — `AttentionIcon` module not found.

- [ ] **Step 4: Implement AttentionIcon component**

Create `src/renderer/src/components/AttentionIcon.tsx`:

```tsx
import { Calendar, MessageCircle, Mail, FileText, Circle } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

const ICON_MAP: Record<string, ComponentType<LucideProps>> = {
  calendar: Calendar,
  'message-circle': MessageCircle,
  mail: Mail,
  'file-text': FileText,
}

interface AttentionIconProps {
  name: string
  size?: number
  className?: string
}

export function AttentionIcon({ name, size = 16, className }: AttentionIconProps) {
  const Icon = ICON_MAP[name] ?? Circle
  return <Icon size={size} className={className} />
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
just test
```

Expected: All `AttentionIcon` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/AttentionIcon.tsx src/renderer/src/components/__tests__/AttentionIcon.test.tsx package.json package-lock.json
git commit -m "feat: add AttentionIcon component with lucide-react"
```

---

### Task 2: Replace emojis in attention components

**Files:**
- Modify: `src/renderer/src/components/AttentionCard.tsx`
- Modify: `src/renderer/src/components/AttentionCard.module.css`
- Modify: `src/renderer/src/components/AttentionPanel.tsx`
- Modify: `src/renderer/src/components/AttentionPanel.module.css`
- Modify: `src/main/types.ts` (doc comment only)
- Modify: `src/renderer/src/stores/__tests__/attentionStore.test.ts` (update test data)

- [ ] **Step 1: Update AttentionCard to use AttentionIcon**

In `src/renderer/src/components/AttentionCard.tsx`, replace the emoji icon render:

Change:
```tsx
<div className={styles.icon}>{item.icon}</div>
```

To:
```tsx
import { AttentionIcon } from './AttentionIcon'
// ...
<div className={styles.icon}>
  <AttentionIcon name={item.icon} size={16} />
</div>
```

- [ ] **Step 2: Update icon container CSS for SVG**

In `src/renderer/src/components/AttentionCard.module.css`, update `.icon`:

Change `font-size: 14px;` to `color: var(--text-secondary);` — SVGs inherit color, don't need font-size.

The full `.icon` rule becomes:
```css
.icon {
  width: var(--icon-container);
  height: var(--icon-container);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-top: 1px;
}
```

Update `.selected .icon` to also set icon color:
```css
.selected .icon {
  background: var(--accent);
  color: var(--text-on-accent);
}
```

- [ ] **Step 3: Update AttentionPanel empty state**

In `src/renderer/src/components/AttentionPanel.tsx`, replace the emoji:

Change:
```tsx
<span className={styles.emptyIcon}>⚡</span>
```

To:
```tsx
import { Zap } from 'lucide-react'
// ...
<span className={styles.emptyIcon}><Zap size={24} /></span>
```

- [ ] **Step 4: Update AttentionPanel empty icon CSS for SVG**

In `src/renderer/src/components/AttentionPanel.module.css`, update `.emptyIcon`:

Change `font-size: var(--font-xl);` to remove it (size is controlled by the SVG prop). Keep the other styles:
```css
.emptyIcon {
  color: var(--text-secondary);
  opacity: 0.5;
}
```

- [ ] **Step 5: Update doc comment in types.ts**

In `src/main/types.ts`, update the icon field comment:

Change:
```ts
icon: string // Emoji (📅 💬 📧 📄)
```

To:
```ts
icon: string // Lucide icon name (calendar, message-circle, mail, file-text)
```

- [ ] **Step 6: Update test data in attentionStore tests**

In `src/renderer/src/stores/__tests__/attentionStore.test.ts`, replace emoji icons with Lucide names:

- `'📅'` → `'calendar'`
- `'💬'` → `'message-circle'`

- [ ] **Step 7: Run tests**

```bash
just test
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/AttentionCard.tsx src/renderer/src/components/AttentionCard.module.css src/renderer/src/components/AttentionPanel.tsx src/renderer/src/components/AttentionPanel.module.css src/main/types.ts src/renderer/src/stores/__tests__/attentionStore.test.ts
git commit -m "feat: replace emoji icons with Lucide SVGs in attention pane"
```

---

### Task 3: Update tool description and system prompt for icon names

**Files:**
- Modify: `src/main/copilot/tools.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/__tests__/copilot-tools.test.ts`

- [ ] **Step 1: Update set_attention_items tool description**

In `src/main/copilot/tools.ts`, line 253, change the icon property description:

Change:
```ts
icon: { type: 'string', description: 'Emoji icon (📅 💬 📧 📄)' },
```

To:
```ts
icon: { type: 'string', description: 'Lucide icon name: calendar, message-circle, mail, file-text' },
```

- [ ] **Step 2: Update system prompt**

In `src/main/index.ts`, update the system message (line 64). Change the part about set_attention_items:

Change:
```
Each item needs an id, icon (emoji), title, description,
```

To:
```
Each item needs an id, icon (Lucide icon name: calendar, message-circle, mail, file-text), title, description,
```

- [ ] **Step 3: Update test data in copilot-tools test**

In `src/main/__tests__/copilot-tools.test.ts`, line 65, change:

```ts
const items = [{ id: '1', icon: '📅', title: 'Meeting', description: 'Test', metadata: {} }]
```

To:
```ts
const items = [{ id: '1', icon: 'calendar', title: 'Meeting', description: 'Test', metadata: {} }]
```

- [ ] **Step 4: Run tests**

```bash
just test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/copilot/tools.ts src/main/index.ts src/main/__tests__/copilot-tools.test.ts
git commit -m "feat: update tool description and system prompt for Lucide icon names"
```

---

### Task 4: Move header to bottom bar

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.module.css`

- [ ] **Step 1: Replace header with bottom bar in App.tsx**

In `src/renderer/src/App.tsx`:

Add Lucide import at top:
```tsx
import { Settings as SettingsIcon } from 'lucide-react'
```

Replace the `<header>` block (lines 46-57) and move it after `</div>` closing `splitBody` (line 79). The header becomes a footer:

Remove:
```tsx
      <header className={styles.header}>
        <span className={styles.headerIcon}>⚡</span>
        <span className={styles.headerLabel}>FLINT</span>
        <button
          className={styles.settingsButton}
          onClick={toggleSettings}
          aria-label="Open settings"
          type="button"
        >
          ⚙
        </button>
      </header>

      <div className={styles.splitBody}>
```

Replace with:
```tsx
      <div className={styles.splitBody}>
```

And after the closing `</div>` of `splitBody`, before the settings conditional, add:
```tsx
      <footer className={styles.bottomBar}>
        <button
          className={styles.settingsButton}
          onClick={toggleSettings}
          aria-label="Open settings"
          type="button"
        >
          <SettingsIcon size={16} />
        </button>
      </footer>
```

The full return becomes:
```tsx
    <div className={styles.root} data-testid="app-root">
      <div className={styles.splitBody}>
        {/* Left panel: attention */}
        <div className={styles.splitLeft}>
          <AttentionPanel
            items={items}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onOpen={handleOpen}
          />
        </div>

        {/* Right panel: chat */}
        <div className={styles.splitRight}>
          <ChatPanel messages={messages} streamingContent={streamingContent} isStreaming={isStreaming} />
          <ChatInput
            onSend={sendMessage}
            disabled={isStreaming}
            selectedItems={selectedItemSummaries}
          />
        </div>
      </div>

      <footer className={styles.bottomBar}>
        <button
          className={styles.settingsButton}
          onClick={toggleSettings}
          aria-label="Open settings"
          type="button"
        >
          <SettingsIcon size={16} />
        </button>
      </footer>

      {showSettings && isLoaded && (
        <Settings config={config} onUpdate={updateConfig} onClose={() => setShowSettings(false)} />
      )}
    </div>
```

- [ ] **Step 2: Update CSS — remove header styles, add bottom bar**

In `src/renderer/src/App.module.css`:

Remove `.header`, `.headerIcon`, `.headerLabel` rules (lines 14-31).

Replace with `.bottomBar`:
```css
.bottomBar {
  padding: var(--space-xs) var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  border-top: 1px solid var(--border-subtle);
}
```

Remove `border-top` from `.splitBody` (line 59) since the bottom bar now has `border-top` and the split body is at the top:
```css
.splitBody {
  flex: 1;
  display: flex;
  min-height: 0;
}
```

- [ ] **Step 3: Run typecheck and tests**

```bash
just check
```

Expected: All checks pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.module.css
git commit -m "feat: move app chrome to bottom bar with Lucide settings icon"
```

---

### Task 5: Chat auto-scroll

**Files:**
- Modify: `src/renderer/src/components/ChatPanel.tsx`

- [ ] **Step 1: Add auto-scroll logic to ChatPanel**

In `src/renderer/src/components/ChatPanel.tsx`, add `useRef`, `useEffect`, and `useCallback` imports, then implement scroll tracking:

```tsx
import { useRef, useEffect, useCallback } from 'react'
import styles from './ChatPanel.module.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
}

const SCROLL_THRESHOLD = 50

export function ChatPanel({ messages, streamingContent, isStreaming }: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const handleScroll = useCallback(() => {
    const el = panelRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceFromBottom <= SCROLL_THRESHOLD
  }, [])

  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = panelRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })

  if (messages.length === 0 && !isStreaming) return null

  return (
    <div className={styles.panel} ref={panelRef} onScroll={handleScroll}>
      {messages.map((msg, i) => (
        <div key={i} className={`${styles.message} ${styles[msg.role]}`}>
          <div className={styles.content}>{msg.content}</div>
        </div>
      ))}
      {isStreaming && (
        <div className={`${styles.message} ${styles.assistant}`}>
          <div className={styles.content}>
            {streamingContent || <span className={styles.thinking}>Thinking…</span>}
          </div>
        </div>
      )}
    </div>
  )
}
```

Key design decisions:
- `isNearBottomRef` is a ref (not state) to avoid re-renders on every scroll event.
- The `useEffect` has no dependency array — it runs after every render (each streaming delta). This is intentional: the component re-renders on every delta, and we want to scroll after each one.
- `scrollTop = scrollHeight` is instant (no smooth scrolling), keeping the streaming path zero-overhead.
- `SCROLL_THRESHOLD = 50` provides a comfortable zone for "near bottom" detection.

- [ ] **Step 2: Run tests**

```bash
just test
```

Expected: All tests PASS. No existing ChatPanel tests to break.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ChatPanel.tsx
git commit -m "feat: add auto-scroll to chat panel with scroll-lock"
```

---

### Task 6: Click-to-select cards

**Files:**
- Modify: `src/renderer/src/components/AttentionCard.tsx`
- Modify: `src/renderer/src/components/AttentionCard.module.css`

- [ ] **Step 1: Update AttentionCard interaction model**

Replace `src/renderer/src/components/AttentionCard.tsx` with:

```tsx
import { ExternalLink } from 'lucide-react'
import type { AttentionItem } from '../../../main/types'
import { AttentionIcon } from './AttentionIcon'
import styles from './AttentionCard.module.css'

interface AttentionCardProps {
  item: AttentionItem
  isSelected: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
}

function formatRelativeTime(timestamp?: string): string | null {
  if (!timestamp) return null
  const diff = new Date(timestamp).getTime() - Date.now()
  const absDiff = Math.abs(diff)
  const minutes = Math.round(absDiff / 60_000)
  const hours = Math.round(absDiff / 3_600_000)
  const days = Math.round(absDiff / 86_400_000)

  if (diff > 0) {
    if (minutes <= 1) return 'now'
    if (minutes < 60) return `in ${minutes}m`
    if (hours < 24) return `in ${hours}h`
    if (days === 1) return 'tomorrow'
    return `in ${days}d`
  } else {
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'yesterday'
    return `${days}d ago`
  }
}

function isFutureTimestamp(timestamp?: string): boolean {
  if (!timestamp) return false
  return new Date(timestamp).getTime() > Date.now()
}

export function AttentionCard({ item, isSelected, onSelect, onOpen }: AttentionCardProps) {
  const relativeTime = formatRelativeTime(item.timestamp)
  const isFuture = isFutureTimestamp(item.timestamp)
  const cardClassName = `${styles.card} ${isSelected ? styles.selected : ''}`

  const handleCardClick = () => {
    onSelect(item.id)
  }

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(item.id)
    }
  }

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpen(item.id)
  }

  return (
    <div
      className={cardClassName}
      data-testid={`attention-card-${item.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className={styles.icon}>
        <AttentionIcon name={item.icon} size={16} />
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{item.title}</div>
        {item.description && <div className={styles.description}>{item.description}</div>}

        {item.openAction && (
          <div className={styles.actions}>
            <button
              className={styles.openButton}
              onClick={handleOpenClick}
              type="button"
            >
              Open <ExternalLink size={12} />
            </button>
          </div>
        )}
      </div>

      {relativeTime && (
        <span
          className={`${styles.timeBadge} ${isFuture ? styles.timeBadgeFuture : styles.timeBadgePast}`}
        >
          {relativeTime}
        </span>
      )}
    </div>
  )
}
```

Changes from current:
- Card div gets `role="button"`, `tabIndex={0}`, `aria-pressed`, `onClick`, `onKeyDown`.
- "Select" button removed entirely.
- "Open" button uses `stopPropagation` and Lucide `ExternalLink` icon.
- `AttentionIcon` used for the item icon (from Task 2).

- [ ] **Step 2: Update CSS — remove select button, restyle open button**

In `src/renderer/src/components/AttentionCard.module.css`:

Update `.card` — change `cursor: default` to `cursor: pointer`:
```css
.card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  margin: 0 var(--space-sm) 2px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  position: relative;
}
```

Add focus-visible style after `.card:hover`:
```css
.card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

Replace the entire actions section (lines 106-157). Remove `.selectButton`, `.selectButtonActive` rules. Restyle `.openButton` with the accent/filled style:

```css
/* ── Actions ───────────────────────────────────────────────── */

.actions {
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
  align-self: flex-end;
  margin-top: var(--space-xs);
}

.openButton {
  font-family: inherit;
  font-size: var(--font-xs);
  font-weight: 600;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--accent);
  color: var(--text-on-accent);
}

.openButton:hover {
  background: var(--accent-hover);
  color: var(--text-on-accent);
}
```

- [ ] **Step 3: Run all checks**

```bash
just check
```

Expected: All checks pass (lint, format, typecheck, test).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/AttentionCard.tsx src/renderer/src/components/AttentionCard.module.css
git commit -m "feat: click-to-select cards with restyled open button"
```

---

## Execution Order

Tasks 1–3 are sequential (icon system build-up). Tasks 4–6 depend on Task 1 (lucide-react installed). Recommended execution:

```
1. Install lucide + icon mapping  ──► 2. Replace emojis  ──► 3. Update tool/prompt
                                  └──► 4. Bottom bar
                                  └──► 6. Click-to-select (uses ExternalLink from lucide)

5. Chat auto-scroll  (fully independent — no lucide dependency, can start immediately)
```

Tasks 4, 5, and 6 can run in parallel after Task 1 completes. Task 5 has zero dependency on lucide and can start immediately.
