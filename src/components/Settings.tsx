import { useState } from "react";
import GeneralSettings from "./settings/GeneralSettings";
import AppearanceSettings from "./settings/AppearanceSettings";
import ChatSettings from "./settings/ChatSettings";
import SearchSettings from "./settings/SearchSettings";
import KitsSettings from "./settings/KitsSettings";
import { useConfig } from "../hooks/useConfig";
import styles from "./Settings.module.css";

type SettingsPage = "general" | "appearance" | "chat" | "search" | "kits";

const PAGES: { id: SettingsPage; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "chat", label: "Chat" },
  { id: "search", label: "Search" },
  { id: "kits", label: "Kits" },
];

export default function Settings() {
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const { config, isLoading, update } = useConfig();

  if (isLoading || !config) {
    return <div className={styles.container}>Loading…</div>;
  }

  return (
    <div className={styles.container}>
      <nav className={styles.sidebar}>
        <h1 className={styles.title}>Settings</h1>
        {PAGES.map((page) => (
          <button
            key={page.id}
            className={activePage === page.id ? styles.navItemActive : styles.navItem}
            onClick={() => {
              setActivePage(page.id);
            }}
          >
            {page.label}
          </button>
        ))}
        <div className={styles.version}>v0.1.0</div>
      </nav>
      <main className={styles.content}>
        {activePage === "general" && <GeneralSettings config={config} onUpdate={update} />}
        {activePage === "appearance" && <AppearanceSettings config={config} onUpdate={update} />}
        {activePage === "chat" && <ChatSettings config={config} onUpdate={update} />}
        {activePage === "search" && <SearchSettings config={config} onUpdate={update} />}
        {activePage === "kits" && <KitsSettings config={config} onUpdate={update} />}
      </main>
    </div>
  );
}
