/**
 * Minimal markdown-to-JSX renderer for chat assistant messages.
 *
 * Supports: fenced code blocks, inline code, bold, italic, links,
 *           headings, horizontal rules, unordered/ordered lists, blockquotes.
 * Intentionally lightweight — no full AST, no dependencies.
 */

import type { ReactNode } from "react";
import { createElement } from "react";

interface Block {
  type: "code" | "paragraph" | "heading" | "hr" | "list" | "blockquote";
  content: string;
  language?: string;
  headingLevel?: number;
  ordered?: boolean;
  items?: string[];
}

/** Split markdown text into typed blocks. */
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
    const line = lines[i] ?? "";

    // Fenced code block
    const fenceMatch = /^```(\w*)$/.exec(line);
    if (fenceMatch) {
      flushParagraph();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
      const language = fenceMatch[1] ?? undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      blocks.push({ type: "code", content: codeLines.join("\n"), language });
      i++; // skip closing ```
      continue;
    }

    // Heading: # through ######
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: "heading",
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
        headingLevel: (headingMatch[1] ?? "#").length,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
        content: headingMatch[2] ?? "",
      });
      i++;
      continue;
    }

    // Horizontal rule: ---, ***, ___ (3 or more)
    if (/^[-*_]{3,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Blockquote: lines starting with "> "
    if (line.startsWith("> ") || line === ">") {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && ((lines[i] ?? "").startsWith("> ") || lines[i] === ">")) {
        quoteLines.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // List items: unordered (- or *) or ordered (1. 2. etc.)
    const unorderedMatch = /^(\s*)[-*]\s+(.+)$/.exec(line);
    const orderedMatch = /^(\s*)\d+\.\s+(.+)$/.exec(line);
    if (unorderedMatch ?? orderedMatch) {
      flushParagraph();
      const isOrdered = !!orderedMatch;
      const listItems: string[] = [];
      const listItemPattern = isOrdered ? /^(\s*)\d+\.\s+(.+)$/ : /^(\s*)[-*]\s+(.+)$/;
      while (i < lines.length) {
        const itemMatch = listItemPattern.exec(lines[i] ?? "");
        if (itemMatch) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
          listItems.push(itemMatch[2] ?? "");
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered: isOrdered, items: listItems, content: "" });
      continue;
    }

    // Default: accumulate into paragraph
    paragraphLines.push(line);
    i++;
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
    if (match[1] !== undefined) {
      // Inline code
      nodes.push(createElement("code", { key: key++, className: "md-inline-code" }, match[1]));
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
    } else if (match[2] !== undefined) {
      // Bold
      nodes.push(createElement("strong", { key: key++ }, match[2]));
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
    } else if (match[3] !== undefined) {
      // Italic
      nodes.push(createElement("em", { key: key++ }, match[3]));
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex groups can be undefined at runtime
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

      if (block.type === "heading") {
        const level = block.headingLevel ?? 1;
        const tag = `h${String(level)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        return createElement(
          tag,
          { key: i, className: `md-heading md-h${String(level)}` },
          ...parseInline(block.content),
        );
      }

      if (block.type === "hr") {
        return createElement("hr", { key: i, className: "md-hr" });
      }

      if (block.type === "list") {
        const tag = block.ordered ? "ol" : "ul";
        const listClass = block.ordered ? "md-list-ordered" : "md-list";
        return createElement(
          tag,
          { key: i, className: listClass },
          (block.items ?? []).map((item, j) =>
            createElement("li", { key: j, className: "md-list-item" }, ...parseInline(item)),
          ),
        );
      }

      if (block.type === "blockquote") {
        return createElement(
          "blockquote",
          { key: i, className: "md-blockquote" },
          ...parseInline(block.content),
        );
      }

      // Paragraph — split by double newlines into separate paragraphs
      const paragraphs = block.content.split(/\n{2,}/);
      return paragraphs.map((para, j) => {
        if (para.trim().length === 0) return null;
        return createElement(
          "p",
          { key: `${String(i)}-${String(j)}`, className: "md-paragraph" },
          ...parseInline(para.trim()),
        );
      });
    }),
  );
}
