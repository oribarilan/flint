import { useState } from "react";
import type { FlintConfig } from "../../lib/commands";
import { applyFontSize, applyTheme } from "../../lib/applyTheme";
import styles from "./settings.module.css";

interface AppearanceSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
  onResetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
}

const FONT_SIZES = [
  { value: "extra-small", label: "Extra Small" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;

const THEMES = [
  { value: "flint", label: "Flint", accent: "#6366f1", bg: "#141419" },
  { value: "tokyonight", label: "Tokyo Night", accent: "#7aa2f7", bg: "#1a1b26" },
  { value: "catppuccin", label: "Catppuccin", accent: "#cba6f7", bg: "#1e1e2e" },
  { value: "rosepine", label: "Rosé Pine", accent: "#c4a7e7", bg: "#191724" },
  { value: "gruvbox", label: "Gruvbox", accent: "#fe8019", bg: "#282828" },
  { value: "github-light", label: "GitHub Light", accent: "#0969da", bg: "#ffffff" },
  { value: "catppuccin-latte", label: "Catppuccin Latte", accent: "#8839ef", bg: "#eff1f5" },
] as const;

export default function AppearanceSettings({
  config,
  onUpdate,
  onResetSection,
}: AppearanceSettingsProps) {
  const currentSize = config.appearance.font_size;
  const currentTheme = config.appearance.theme;
  const [confirming, setConfirming] = useState(false);

  const handleFontSizeChange = (size: string) => {
    applyFontSize(size);
    void onUpdate({
      ...config,
      appearance: { ...config.appearance, font_size: size },
    });
  };

  const handleThemeChange = (theme: string) => {
    applyTheme(theme);
    void onUpdate({
      ...config,
      appearance: { ...config.appearance, theme },
    });
  };

  const handleResetDefaults = async () => {
    const updated = await onResetSection("appearance");
    if (updated) {
      applyFontSize(updated.appearance.font_size);
      applyTheme(updated.appearance.theme);
    }
    setConfirming(false);
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Appearance</h2>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Theme</h3>
        <div className={styles.themeGrid}>
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              className={currentTheme === theme.value ? styles.themeCardActive : styles.themeCard}
              onClick={() => {
                handleThemeChange(theme.value);
              }}
            >
              <div
                className={styles.themeSwatch}
                style={{
                  background: theme.bg,
                  borderColor: currentTheme === theme.value ? theme.accent : "transparent",
                }}
              >
                <div className={styles.themeAccent} style={{ background: theme.accent }} />
              </div>
              <span className={styles.themeLabel}>{theme.label}</span>
            </button>
          ))}
        </div>
      </section>

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

      <div className={styles.resetRow}>
        {confirming ? (
          <>
            <span className={styles.resetConfirmText}>Reset appearance to defaults?</span>
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
