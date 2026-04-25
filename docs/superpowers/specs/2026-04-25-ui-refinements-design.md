# UI Refinements — Design Spec

Four independent UI improvements to the Flint overlay.

## 1. Chat Auto-Scroll

**Goal:** Chat panel scrolls to bottom as messages and streaming deltas arrive, without fighting the user.

**Behavior:**
- On new messages or streaming content, scroll to bottom automatically.
- If the user scrolls up (more than ~50px from bottom), auto-scroll pauses.
- When the user scrolls back near the bottom (~50px threshold), auto-scroll resumes.

**Implementation:**
- `useRef` on the scroll container, `isScrolledToBottom` state flag.
- `onScroll` handler updates the flag based on distance from bottom.
- `useEffect` after renders: if `isScrolledToBottom`, call `scrollTo({ top: scrollHeight })`.
- No `smooth` behavior — instant scroll to stay on the performance-critical streaming path. Direct DOM mutation in `useEffect`, no `requestAnimationFrame`.

**Files:** `src/renderer/src/components/ChatPanel.tsx`, `ChatPanel.module.css` (no CSS changes expected).

## 2. Lucide Icons in Attention Pane

**Goal:** Replace emoji icons with Lucide React SVG icons across the attention pane and app chrome.

**Dependency:** `lucide-react` (tree-shakeable, ~1KB per icon).

**Data model:** `AttentionItem.icon` stays `string`, but values change from emoji (`📅`) to Lucide icon names (`"calendar"`, `"message-circle"`, `"mail"`, `"file-text"`).

**Renderer mapping:** A small mapping function takes the icon name string and returns the corresponding Lucide component. Explicitly maps known names; falls back to a generic icon (`Circle`) for unknown values. Only mapped icons are imported — tree-shaking friendly.

**Scope of emoji replacement:**
- Attention card icons: `item.icon` emoji → Lucide component via mapping
- Empty state: `⚡` → Lucide `Zap`

**Agent-side:** The `set_attention_items` tool description updates to list valid Lucide icon names instead of emojis.

**Files:** `src/renderer/src/components/AttentionCard.tsx`, `AttentionPanel.tsx`, `src/main/tools/` (tool description), `src/main/types.ts` (doc comment update).

## 3. Bottom Bar

**Goal:** Move the app chrome bar from top to bottom. Remove branding, keep settings.

**Layout:** The current top `<header>` moves to the bottom of the app, below both the attention panel and chat panel — outside the two-column layout, spanning full width.

**Content:** Settings button only. No `⚡` icon, no "FLINT" text.

**Settings icon:** `⚙` emoji replaced with Lucide `Settings` icon (depends on task 2 installing `lucide-react`).

**Dimensions:** Same height/padding as the current top bar.

**Files:** `src/renderer/src/App.tsx`, `App.module.css`.

## 4. Click-to-Select Cards

**Goal:** Simplify card interaction — clicking the card selects it, "Open" button stays with a more prominent style.

**Interaction model:**
- Entire `AttentionCard` is clickable → toggles selection (replaces the "Select" button).
- "Open" button stays, gets the filled/accent style (the style "Select" currently has). `↗` text replaced with Lucide `ExternalLink` icon (depends on task 2 installing `lucide-react`).
- Clicking "Open" only opens — `stopPropagation` prevents card-level click.
- `✓ Selected` text removed; selection is shown purely through the card's visual state (accent left border + subtle accent background).

**Accessibility:**
- Card container: `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space.
- Focus ring on the card via `:focus-visible`.
- "Open" button retains its own focus target within the card.

**Visual:**
- Card: `cursor: pointer`.
- "Open" button: accent background, contrasting text (currently the Select button style).
- Selected card state: unchanged (accent left border + subtle accent bg).

**Files:** `src/renderer/src/components/AttentionCard.tsx`, `AttentionCard.module.css`.

## Task Dependencies

Tasks 1 and 4 are fully independent. Tasks 2 and 3 share a dependency: task 3 uses Lucide `Settings` icon installed in task 2. Recommended order: 2 → 3, with 1 and 4 in parallel.

```
1. Chat Auto-Scroll  ─────────────────►  done
2. Lucide Icons  ──► 3. Bottom Bar  ──►  done
             └──────► 4. Click-to-Select ► done
```
