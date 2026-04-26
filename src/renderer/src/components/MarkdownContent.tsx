import { memo } from "react";
import type { MouseEvent } from "react";
import { renderMarkdown } from "../lib/markdown";
import styles from "./MarkdownContent.module.css";

interface MarkdownContentProps {
  content: string;
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  const handleClick = (e: MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    const href = anchor?.getAttribute("href");
    if (href) {
      e.preventDefault();
      window.flint?.openLink(href);
    }
  };

  return (
    <div className={styles.markdown} onClick={handleClick}>
      {renderMarkdown(content)}
    </div>
  );
});
