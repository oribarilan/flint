# US-markdown-support

## Goal

Render assistant chat messages as styled markdown instead of plain text. The agent should produce well-structured responses using bold, italic, headers, lists, and code blocks (no emojis), and the renderer should display them with Flint's design language — using color and weight to create visual hierarchy.

## Definition of Done

- [x] Assistant messages render markdown (bold, italic, headers, lists, inline code, code blocks, links) with Variant D styling
- [x] Bold text renders as weight 600 + accent amber color
- [x] Italic text renders as italic style + warm tint (`oklch(78% 0.04 65)`)
- [x] Links have persistent underline (subtle, full on hover) and open in the system browser
- [x] Code blocks use `--font-mono`, `--bg-primary` background, `--border-subtle` border
- [x] User messages remain plain text (no markdown rendering)
- [x] Streaming renders live markdown (formatting builds up as deltas arrive)
- [x] System prompt instructs the agent to use markdown formatting and never use emojis
- [x] All new code has unit tests
- [ ] `just check` passes (1 pre-existing failure in App.test.tsx — unrelated to this US)

## Task Priority

1. `system-prompt.md` — Quick, independent. Agent starts producing structured markdown and stops using emojis immediately. No frontend dependency.
2. `markdown-rendering.md` — Core task. Install react-markdown, create MarkdownContent component with Variant D styling, wire into ChatPanel, handle links.

## Cross-Cutting Concerns

- **Variant D (Hybrid) styling**: Bold = `font-weight: 600` + `--accent` color. Italic = `font-style: italic` + `oklch(78% 0.04 65)`. This was validated in the showcase (`showcases/markdown-rendering-showcase.html`).
- **Link vs bold distinction**: Both use amber, but links have a persistent underline at 40% opacity (full on hover). This is the only visual differentiator — don't remove it.
- **User messages are never rendered as markdown**: Users type plain text. Rendering their `**bold**` would be confusing.
- **Streaming performance**: `react-markdown` re-parses the full string on each delta. This is fast for chat-length content but should be verified under rapid streaming. If it becomes a problem, throttle re-renders (not the delta accumulation).
- **New `link:open` IPC channel**: No existing `openExternal` is exposed to the renderer. Add `link:open` to `IPC_CHANNELS`, handler in `handlers.ts`, `openLink` in preload. Only allow `http:`/`https:` protocols.
- **Design tokens**: Two new tokens in `global.css` — `--md-italic-color` and `--md-link-underline`. Bold reuses `--accent`.
- **CSS Module, not global styles**: `MarkdownContent.module.css` scopes all markdown styles. No global CSS additions except the two tokens.
- **`white-space: pre-wrap` removal**: Currently on `.message` (shared). Must move to `.user` only, since markdown handles whitespace via `<p>` and `<br>`.
