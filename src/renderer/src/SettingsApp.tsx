import { useEffect } from "react";
import { useConfig } from "./hooks/useConfig";
import { Settings } from "./components/Settings";
import styles from "./SettingsApp.module.css";

export function SettingsApp() {
  const { config, isLoaded, updateConfig } = useConfig();

  useEffect(() => {
    if (isLoaded) {
      document.documentElement.dataset.fontSize = config.fontSize;
    }
  }, [isLoaded, config.fontSize]);

  useEffect(() => {
    const unsub = window.flint?.onThemeChanged((theme: string) => {
      document.documentElement.dataset.theme = theme;
    });
    return () => {
      unsub?.();
    };
  }, []);

  return (
    <div className={styles.root} data-testid="settings-root">
      <Settings config={config} onUpdate={updateConfig} />
    </div>
  );
}
