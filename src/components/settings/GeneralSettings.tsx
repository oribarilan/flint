import type { FlintConfig } from "../../lib/commands";
import styles from "./settings.module.css";

interface GeneralSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
}

export default function GeneralSettings({ config, onUpdate }: GeneralSettingsProps) {
  const handleLaunchToggle = () => {
    void onUpdate({
      ...config,
      general: { ...config.general, launch_at_login: !config.general.launch_at_login },
    });
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
    </div>
  );
}
