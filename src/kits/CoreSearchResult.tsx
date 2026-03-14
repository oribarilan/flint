/**
 * Core file search result renderer.
 *
 * Renders file/directory/application results with the existing KindIcon
 * component, maintaining backward compatibility with the pre-kit UI.
 */

import type { KitResultProps } from "./registry";
import KindIcon from "../components/KindIcon";
import ResultMeta from "../components/ResultMeta";
import styles from "../components/ResultsList.module.css";

/** Extract the entry kind from the result's Named icon. */
function getKind(result: KitResultProps["result"]): "file" | "directory" | "application" {
  if (result.icon?.type === "Named") {
    const value = result.icon.value;
    if (value === "directory" || value === "application") return value;
  }
  return "file";
}

export default function CoreSearchResult({ result, isSelected }: KitResultProps) {
  const kind = getKind(result);
  const path = result.actions[0]?.type === "Open" ? result.actions[0].target : "";

  return (
    <>
      <KindIcon kind={kind} path={path} selected={isSelected} />
      <div className={styles.details}>
        <span className={styles.name}>{result.title}</span>
        {result.subtitle && <span className={styles.path}>{result.subtitle}</span>}
      </div>
      <ResultMeta result={result} />
    </>
  );
}
