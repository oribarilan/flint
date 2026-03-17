/**
 * Minimal markdown-to-JSX renderer for chat assistant messages.
 *
 * Supports: fenced code blocks, inline code, bold, italic, links.
 * Intentionally lightweight — no full AST, no dependencies.
 */

import type { ReactNode } from "react";
import { createElement } from "react";

interface Block {
  type: "code" | "paragraph";
  content: string;
  language?: string;
}

/** Split markdown text into code blocks and paragraphs. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", content: paragraphLines.join("\n") });
      paragraphLines = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const fenceMatch = line.match(/^```(\w*)$/);
    if (fenceMatch) {
      flushParagraph();
      const language = fenceMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      blocks.push({ type: "code", content: codeLines.join("\n"), language });
      i++; // skip closing ```
    } else {
      paragraphLines.push(line);
      i++;
    }
  }

  flushParagraph();
  return blocks;
}

/** Parse inline markdown (bold, italic, code, links) into React nodes. */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Regex matches: `code`, **bold**, *italic*, [text](url)
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // Inline code
      nodes.push(createElement("code", { key: key++, className: "md-inline-code" }, match[1]));
    } else if (match[2] !== undefined) {
      // Bold
      nodes.push(createElement("strong", { key: key++ }, match[2]));
    } else if (match[3] !== undefined) {
      // Italic
      nodes.push(createElement("em", { key: key++ }, match[3]));
    } else if (match[4] !== undefined && match[5] !== undefined) {
      // Link
      nodes.push(
        createElement(
          "a",
          {
            key: key++,
            href: match[5],
            target: "_blank",
            rel: "noopener noreferrer",
            className: "md-link",
          },
          match[4],
        ),
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

/** Render a markdown string as React elements. */
export function renderMarkdown(text: string): ReactNode {
  const blocks = parseBlocks(text);

  return createElement(
    "div",
    { className: "md-root" },
    blocks.map((block, i) => {
      if (block.type === "code") {
        return createElement(
          "pre",
          { key: i, className: "md-code-block" },
          createElement(
            "code",
            { className: block.language ? `language-${block.language}` : undefined },
            block.content,
          ),
        );
      }

      // Paragraph — split by double newlines into separate paragraphs
      const paragraphs = block.content.split(/\n{2,}/);
      return paragraphs.map((para, j) => {
        if (para.trim().length === 0) return null;
        return createElement(
          "p",
          { key: `${i}-${j}`, className: "md-paragraph" },
          ...parseInline(para.trim()),
        );
      });
    }),
  );
}
