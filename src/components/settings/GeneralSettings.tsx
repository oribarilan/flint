import { useState } from "react";
import type { FlintConfig } from "../../lib/commands";
import styles from "./settings.module.css";

interface GeneralSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

export default function GeneralSettings({
  config,
  onUpdate,
  onResetSection,
}: GeneralSettingsProps) {
  const [confirming, setConfirming] = useState(false);

  const handleLaunchToggle = () => {
    void onUpdate({
      ...config,
      general: { ...config.general, launch_at_login: !config.general.launch_at_login },
    });
  };

  const handleResetDefaults = async () => {
    await onResetSection("general");
    setConfirming(false);
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>General</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Keyboard</h3>
        <div className={styles.row}>
          <span className={styles.label}>Global hotkey</span>
          <span className={styles.value}>{config.general.hotkey}</span>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Startup</h3>
        <div className={styles.row}>
          <span className={styles.label}>Launch at login</span>
          <button
            className={config.general.launch_at_login ? styles.toggleOn : styles.toggle}
            onClick={handleLaunchToggle}
            aria-label="Toggle launch at login"
          />
        </div>
      </section>

      <div className={styles.resetRow}>
        {confirming ? (
          <>
            <span className={styles.resetConfirmText}>Reset general settings to defaults?</span>
            <button className={styles.buttonGhost} onClick={() => void handleResetDefaults()}>
              Confirm
            </button>
            <button
              className={styles.buttonGhost}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className={styles.buttonGhost}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Restore Defaults
          </button>
        )}
      </div>
    </div>
  );
}
