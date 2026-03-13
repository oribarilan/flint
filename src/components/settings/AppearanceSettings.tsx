import type { FlintConfig } from "../../lib/commands";
import { applyFontSize } from "../../lib/applyTheme";
import styles from "./settings.module.css";

interface AppearanceSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
}

const FONT_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

export default function AppearanceSettings({ config, onUpdate }: AppearanceSettingsProps) {
  const currentSize = config.appearance.font_size;

  const handleFontSizeChange = (size: string) => {
    applyFontSize(size);
    void onUpdate({
      ...config,
      appearance: { ...config.appearance, font_size: size },
    });
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Appearance</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Font Size</h3>
        <div className={styles.row}>
          <span className={styles.label}>Interface font size</span>
          <div className={styles.segmentedControl}>
            {FONT_SIZES.map((opt) => (
              <button
                key={opt.value}
                className={
                  currentSize === opt.value ? styles.segmentedButtonActive : styles.segmentedButton
                }
                onClick={() => {
                  handleFontSizeChange(opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
