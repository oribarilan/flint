# Markdown Chat Rendering — Design Spec

## Problem

Flint's chat panel renders assistant messages as plain text. The agent (gpt-4.1) naturally produces markdown — bold, headers, lists, code blocks — but it all displays as raw syntax characters. The result is dense, unscannable walls of text.

Additionally, the agent has no formatting guidance in its system prompt and sometimes uses emojis, which don't fit Flint's visual identity.

## Solution

1. **Render markdown in assistant messages** using `react-markdown` with custom component overrides styled via CSS Modules and design tokens.
2. **Update the system prompt** to instruct the agent to use markdown formatting and never use emojis.
3. **Use Variant D (Hybrid) styling** for bold and italic — combining typographic weight/style changes with color differentiation for a richer visual hierarchy.

## Decisions

### Library: `react-markdown`

Chosen over `marked` + `DOMPurify` (less React-idiomatic, requires HTML sanitization) and a custom parser (maintenance burden, edge case risk). Bundle size (~25-30KB gzipped) is negligible in an Electron app.

### Markdown scope: Essential set

Bold, italic, headers (h2/h3), bullet/numbered lists, inline code, code blocks, and links. No tables, blockquotes, task lists, or strikethrough. No `remarkPlugins` or `rehypePlugins` needed — the essential set is built into react-markdown.

### No syntax highlighting

Code blocks use monospace font with a distinct background. No language-specific coloring (would require Prism or highlight.js, +15-40KB).

### Variant D (Hybrid) for bold/italic

Validated via showcase (`showcases/markdown-rendering-showcase.html`). Four alternatives were compared:

| Variant | Bold | Italic | Verdict |
|---------|------|--------|---------|
| A. Traditional | weight 600 | font-style italic | Safe but flat on dark bg |
| B. Accent Colors | accent amber, no weight | warm tint, no style | Link confusion (both amber) |
| C. Warm Tints | bright white (L97%) + weight 500 | muted warm (L72%) | Subtle, possibly too quiet |
| **D. Hybrid** | **weight 600 + accent amber** | **italic + warm tint** | **Strongest signal, chosen** |

### Link vs bold distinction

Both bold and links use `--accent` (amber). Links are distinguished by a persistent underline at 40% opacity, full on hover. `text-underline-offset: 2px`.

### User messages: no markdown

User messages stay plain text with `white-space: pre-wrap`. Rendering markdown in user input would be confusing (users type `**bold**` as literal text).

### Live streaming

Markdown renders in real-time as deltas arrive. `react-markdown` re-parses the full accumulated string on each delta — fast for chat-length content.

### No emojis: system prompt only

The system prompt tells the agent not to use emojis. No renderer-side stripping.

## Styling Reference

### Bold (`strong`)

```css
font-weight: 600;
color: var(--accent); /* oklch(74% 0.15 65) */
```

### Italic (`em`)

```css
font-style: italic;
color: var(--md-italic-color); /* oklch(78% 0.04 65) */
```

### Headers

```css
/* h1 — same as h2 (agent rarely uses h1 in chat) */
/* h2 */
font-size: var(--font-lg);
font-weight: 600;
margin-top: var(--space-md);
margin-bottom: var(--space-xs);
line-height: 1.2;

/* h3 */
font-size: var(--font-md);
font-weight: 600;
margin-top: var(--space-sm);
margin-bottom: var(--space-xs);
line-height: 1.2;
```

### Lists

```css
padding-left: var(--space-lg);
margin-bottom: var(--space-sm);
li { margin-bottom: var(--space-xs); }
li::marker { color: var(--text-secondary); }
```

### Inline code

```css
font-family: var(--font-mono);
font-size: var(--font-sm);
background: var(--bg-hover);
padding: 1px 5px;
border-radius: var(--radius-sm);
```

### Code blocks (`pre > code`)

```css
/* pre */
background: var(--bg-primary);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-md);
padding: var(--space-sm) var(--space-md);
overflow-x: auto;

/* code inside pre */
font-family: var(--font-mono);
font-size: var(--font-sm);
line-height: 1.5;
```

### Links

```css
color: var(--accent);
text-decoration: underline;
text-decoration-color: var(--md-link-underline); /* oklch(74% 0.15 65 / 0.4) */
text-underline-offset: 2px;

&:hover {
  text-decoration-color: var(--accent);
}
```

### Paragraphs

```css
margin-bottom: var(--space-sm);
&:last-child { margin-bottom: 0; }
```

## New Design Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| `--md-italic-color` | `oklch(78% 0.04 65)` | Italic text warm tint |
| `--md-link-underline` | `oklch(74% 0.15 65 / 0.4)` | Subtle persistent link underline |

## Architecture

```
ChatPanel.tsx
├── User message → plain text ({msg.content}) with white-space: pre-wrap
├── Assistant message → <MarkdownContent content={msg.content} />
└── Streaming → <MarkdownContent content={streamingContent} />

MarkdownContent.tsx (React.memo)
├── react-markdown with component overrides
├── MarkdownContent.module.css (Variant D styles)
└── Link click → e.preventDefault() → shell.openExternal(href)
```

No changes to: message data model, chat store, streaming logic, IPC layer, ChatInput.
