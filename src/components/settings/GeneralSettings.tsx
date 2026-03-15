import type { FlintConfig } from "../../lib/commands";
import { applyFontSize, applyTheme, applyBackdropBlur } from "../../lib/applyTheme";
import ResetSection from "./ResetSection";
import styles from "./settings.module.css";

interface GeneralSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

const FONT_SIZES = [
  { value: "extra-small", label: "XS" },
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
] as const;

export default function GeneralSettings({
  config,
  onUpdate,
  onResetSection,
}: GeneralSettingsProps) {
  const handleLaunchToggle = () => {
    void onUpdate({
      ...config,
      general: { ...config.general, launch_at_login: !config.general.launch_at_login },
    });
  };

  const handleThemeChange = (theme: string) => {
    applyTheme(theme);
    void onUpdate({
      ...config,
      appearance: { ...config.appearance, theme },
    });
  };

  const handleFontSizeChange = (size: string) => {
    applyFontSize(size);
    void onUpdate({
      ...config,
      appearance: { ...config.appearance, font_size: size },
    });
  };

  const handleBlurToggle = () => {
    const next = !config.appearance.backdrop_blur;
    applyBackdropBlur(next);
    void onUpdate({
      ...config,
      appearance: { ...config.appearance, backdrop_blur: next },
    });
  };

  const handleResetDefaults = async () => {
    await onResetSection("general");
    const updated = await onResetSection("appearance");
    if (updated) {
      applyFontSize(updated.appearance.font_size);
      applyTheme(updated.appearance.theme);
      applyBackdropBlur(updated.appearance.backdrop_blur);
    }
  };

  const currentTheme = config.appearance.theme;
  const currentSize = config.appearance.font_size;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>General</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Behavior</h3>
        <div className={styles.row}>
          <div>
            <span className={styles.label}>Global hotkey</span>
            <span className={styles.sublabel}>Opens Flint from anywhere</span>
          </div>
          <span className={styles.value}>{config.general.hotkey}</span>
        </div>
        <div className={styles.row}>
          <div>
            <span className={styles.label}>Launch at login</span>
            <span className={styles.sublabel}>Start Flint when you log in</span>
          </div>
          <button
            className={config.general.launch_at_login ? styles.toggleOn : styles.toggle}
            onClick={handleLaunchToggle}
            aria-label="Toggle launch at login"
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Appearance</h3>
        <div className={styles.row}>
          <span className={styles.label}>Color theme</span>
          <div className={styles.segmentedControl}>
            <button
              className={
                currentTheme === "system"
                  ? styles.segmentedButtonActive
                  : styles.segmentedButton
              }
              onClick={() => {
                handleThemeChange("system");
              }}
            >
              System
            </button>
            <button
              className={
                currentTheme === "flint" || currentTheme === "flint-dark"
                  ? styles.segmentedButtonActive
                  : styles.segmentedButton
              }
              onClick={() => {
                handleThemeChange("flint");
              }}
            >
              Dark
            </button>
            <button
              className={
                currentTheme === "flint-light"
                  ? styles.segmentedButtonActive
                  : styles.segmentedButton
              }
              onClick={() => {
                handleThemeChange("flint-light");
              }}
            >
              Light
            </button>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Font size</span>
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
        <div className={styles.row}>
          <div>
            <span className={styles.label}>Backdrop blur</span>
            <span className={styles.sublabel}>Glass effect on the launcher overlay</span>
          </div>
          <button
            className={config.appearance.backdrop_blur ? styles.toggleOn : styles.toggle}
            onClick={handleBlurToggle}
            aria-label="Toggle backdrop blur"
          />
        </div>
      </section>

      <ResetSection
        label="Reset general settings to defaults?"
        onReset={handleResetDefaults}
      />
    </div>
  );
}
