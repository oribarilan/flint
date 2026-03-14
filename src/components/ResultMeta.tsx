/**
 * Result metadata badges — shows primitive type and origin kit.
 *
 * Renders right-aligned pills: [Origin Kit] [Type]. The origin pill only
 * appears for kit results; the type pill is always present.
 */

import type { KitSearchResult } from "../kits/types";
import styles from "./ResultsList.module.css";

/** Human-readable label for a result's primitive type. */
function typeLabel(result: KitSearchResult): string {
  return result.kind.type;
}

interface ResultMetaProps {
  result: KitSearchResult;
}

export default function ResultMeta({ result }: ResultMetaProps) {
  return (
    <div className={styles.metaBadges}>
      {result.kitName && <span className={styles.originPill}>{result.kitName}</span>}
      <span className={styles.typePill}>{typeLabel(result)}</span>
    </div>
  );
}
