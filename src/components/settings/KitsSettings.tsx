import { useState, useEffect } from "react";
import type { FlintConfig, KitManifestInfo } from "../../lib/commands";
import { getKitManifests } from "../../lib/commands";
import styles from "./settings.module.css";

interface KitsSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
}

export default function KitsSettings({ config, onUpdate }: KitsSettingsProps) {
  const [kits, setKits] = useState<KitManifestInfo[]>([]);

  useEffect(() => {
    getKitManifests()
      .then(setKits)
      .catch((err: unknown) => {
        console.error("Failed to load kit manifests:", err);
      });
  }, []);

  const isEnabled = (kitId: string): boolean => {
    return config.kits[kitId]?.enabled ?? true;
  };

  const handleToggle = (kitId: string) => {
    const current = isEnabled(kitId);
    void onUpdate({
      ...config,
      kits: {
        ...config.kits,
        [kitId]: { ...config.kits[kitId], enabled: !current },
      },
    });
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Kits</h2>

      {kits.length === 0 && <p className={styles.emptyList}>No kits registered.</p>}

      <section className={styles.section}>
        {kits.map((kit) => (
          <div key={kit.id} className={styles.row}>
            <span className={styles.label}>
              {kit.name}
              {kit.trigger && (
                <span className={styles.value} style={{ marginLeft: "var(--space-sm)" }}>
                  {kit.trigger}
                </span>
              )}
            </span>
            <button
              className={isEnabled(kit.id) ? styles.toggleOn : styles.toggle}
              onClick={() => {
                handleToggle(kit.id);
              }}
              aria-label={`Toggle ${kit.name}`}
            />
          </div>
        ))}
      </section>
    </div>
  );
}
