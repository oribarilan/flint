/**
 * Default kit result renderer.
 *
 * Renders any kit's search result using the standard layout:
 * icon + title/subtitle on left, accessories on right, keyboard hint.
 * Covers most kits — custom components are only needed for truly
 * custom rendering (charts, rich previews).
 */

import type { KitResultProps } from "./registry";
import type { Accessory, KitIcon } from "./types";
import Kbd from "../components/Kbd";
import styles from "../components/ResultsList.module.css";
import iconStyles from "../components/KindIcon.module.css";

/** Prefix for SVG data URIs that we can render inline. */
const SVG_DATA_PREFIX = "data:image/svg+xml,";

export default function DefaultKitResult({ result, isSelected, index }: KitResultProps) {
  return (
    <>
      {result.icon && <KitIconView icon={result.icon} selected={isSelected} />}
      <div className={styles.details}>
        <span className={styles.name}>{result.title}</span>
        {result.subtitle && <span className={styles.path}>{result.subtitle}</span>}
      </div>
      {result.accessories?.map((acc, i) => (
        <AccessoryView key={i} accessory={acc} />
      ))}
      {index < 9 && <Kbd keys={`CmdOrCtrl+${String(index + 1)}`} />}
    </>
  );
}

function KitIconView({ icon, selected }: { icon: KitIcon; selected: boolean }) {
  switch (icon.type) {
    case "Emoji":
      return <span className={styles.name}>{icon.value}</span>;
    case "DataUri":
      if (icon.value.startsWith(SVG_DATA_PREFIX)) {
        // Render inline so `currentColor` picks up the CSS color (accent on select).
        const svgMarkup = decodeURIComponent(icon.value.slice(SVG_DATA_PREFIX.length));
        return (
          <span
            className={selected ? iconStyles.kindIconSelected : iconStyles.kindIcon}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        );
      }
      return (
        <img
          className={iconStyles.kindIcon}
          src={icon.value}
          alt=""
          aria-hidden="true"
        />
      );
    case "Named":
      return null;
  }
}

function AccessoryView({ accessory }: { accessory: Accessory }) {
  switch (accessory.type) {
    case "Text":
      return <span className={styles.path}>{accessory.value}</span>;
    case "Badge":
      return (
        <span style={{ color: accessory.color, fontSize: "var(--font-xs)" }}>{accessory.text}</span>
      );
    case "Icon":
      return accessory.icon.type === "Emoji" ? <span>{accessory.icon.value}</span> : null;
  }
}
