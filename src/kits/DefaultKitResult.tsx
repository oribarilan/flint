/**
 * Default kit result renderer.
 *
 * Renders any kit's search result using the standard layout:
 * icon + title/subtitle on left, accessories on right, keyboard hint.
 * Covers most kits — custom components are only needed for truly
 * custom rendering (charts, rich previews).
 */

import type { KitResultProps } from "./registry";
import type { Accessory } from "./types";
import Kbd from "../components/Kbd";
import styles from "../components/ResultsList.module.css";

export default function DefaultKitResult({ result, index }: KitResultProps) {
  const icon = result.icon;

  return (
    <>
      {icon?.type === "Emoji" && <span className={styles.name}>{icon.value}</span>}
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
