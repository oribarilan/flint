# markdown-rendering

## Context

Assistant chat messages currently render as plain text (`{msg.content}`). This task adds a `MarkdownContent` component that renders markdown using `react-markdown` with Variant D (Hybrid) styling — bold uses weight 600 + accent color, italic uses italic style + warm tint, links have persistent underlines and open externally.

**Value delivered**: Chat responses become visually rich and scannable — headers create sections, bold highlights key info in amber, code blocks are distinct, lists are properly indented.

## Related Files

- `src/renderer/src/components/ChatPanel.tsx` — integration point, replace `{msg.content}` with `<MarkdownContent>`
- `src/renderer/src/components/ChatPanel.module.css` — remove `white-space: pre-wrap` from `.message`, move to `.user`
- `src/renderer/src/styles/global.css` — add `--md-italic-color` and `--md-link-underline` tokens
- `showcases/markdown-rendering-showcase.html` — reference for exact Variant D styling
- `src/preload/index.ts` — may need `openExternal` IPC channel for link handling

## Dependencies

- `system-prompt.md` — should complete first so the agent produces markdown, but not a hard blocker

## Acceptance Criteria

### Component
- [x] New `src/renderer/src/components/MarkdownContent.tsx` exists
- [x] Component accepts `content: string` prop and renders it through the existing `renderMarkdown` parser (no react-markdown needed — custom parser already existed at `src/renderer/src/lib/markdown.ts`)
- [x] Component is wrapped in `React.memo`

### Styling (Variant D — Hybrid)
- [x] `strong` renders with `font-weight: 600` and `color: var(--accent)`
- [x] `em` renders with `font-style: italic` and `color: var(--md-italic-color)`
- [x] `h1` renders same as `h2` (agent rarely uses h1 in chat, but it should degrade gracefully)
- [x] `h2` renders with `--font-lg`, weight 600, top margin `--space-md` (no margin on first-child)
- [x] `h3` renders with `--font-md`, weight 600, top margin `--space-sm`
- [x] `ul`/`ol` have left padding `--space-lg`, list markers colored `--text-secondary`, items spaced `--space-xs`
- [x] Inline `code` uses `--font-mono`, `--font-sm`, `--bg-hover` background, `--radius-sm` padding
- [x] `pre > code` blocks use `--font-mono`, `--font-sm`, `--bg-primary` background, `--border-subtle` border, `--radius-md`, horizontal scroll
- [x] Links use `--accent` color with persistent underline (`text-decoration-color: var(--md-link-underline)`), full opacity underline on hover
- [x] `text-underline-offset: 2px` on links
- [x] Paragraphs have bottom margin `--space-sm`, `last-child` no margin
- [x] All styles in `MarkdownContent.module.css` — no global CSS except tokens

### Design Tokens
- [x] `--md-italic-color: oklch(78% 0.04 65)` added to `:root` in `global.css`
- [x] `--md-link-underline: oklch(74% 0.15 65 / 0.4)` added to `:root` in `global.css`

### Integration
- [x] `ChatPanel.tsx` renders `<MarkdownContent content={msg.content} />` for assistant messages
- [x] `ChatPanel.tsx` renders `<MarkdownContent content={streamingContent} />` for streaming assistant content
- [x] User messages still render as plain text with `{msg.content}`
- [x] `white-space: pre-wrap` removed from `.message` class, added to `.user` class only
- [x] Line height on `.message.assistant` is `1.6` (per design spec)

### Link Handling
- [x] Link clicks call `e.preventDefault()` and open URL in system browser
- [x] New IPC channel `link:open` added to `IPC_CHANNELS` in `src/main/ipc/channels.ts`
- [x] Main process handler calls `shell.openExternal(url)` with URL validation
- [x] Preload exposes `openLink(url: string): void` on `window.flint`
- [x] Links never navigate inside the Electron overlay

### Dependency
- [x] No new dependency needed — used existing `src/renderer/src/lib/markdown.ts` parser instead of react-markdown

### Tests
- [x] MarkdownContent renders bold text with correct className
- [x] MarkdownContent renders italic text with correct className
- [x] MarkdownContent renders code blocks with correct className
- [x] MarkdownContent renders links with correct className and href
- [x] MarkdownContent renders headers, lists
- [x] Link click handler prevents default and triggers external open
- [x] User messages in ChatPanel do NOT render through MarkdownContent
- [x] Streaming content renders through MarkdownContent

## Verification

- **Automated**: Unit tests for MarkdownContent rendering and ChatPanel integration
- **Ad-hoc**: `just check` passes. Manual: send a prompt, confirm markdown renders with Variant D styling — bold in amber, italic in warm tint, code blocks distinct, links underlined and opening in browser.

## Notes

`react-markdown` v9+ requires React 18+. Flint uses React 19, so no compatibility concern.

**v9 API note**: `react-markdown` v9 removed the `inline` prop from the `code` component override. To distinguish inline code from code blocks, check whether the code element's parent is a `pre` element (e.g., via `node.position` or by styling `pre code` vs standalone `code` purely in CSS using `.codeBlock code` vs `.inlineCode` selectors).

The `link:open` IPC channel is new. Pattern: add to `IPC_CHANNELS`, register handler in `handlers.ts` (call `shell.openExternal`), expose `openLink` in preload. Validate URLs — only allow `http:` and `https:` protocols.
