import { useState } from "react";
import GeneralSettings from "./settings/GeneralSettings";
import SearchSettings from "./settings/SearchSettings";
import ChatSettings from "./settings/ChatSettings";
import KitsSettings from "./settings/KitsSettings";
import { useConfig } from "../hooks/useConfig";
import styles from "./Settings.module.css";

type SettingsPage = "general" | "search" | "chat" | "kits";

interface PageDef {
  id: SettingsPage;
  label: string;
  icon: React.ReactNode;
}

const PAGES: PageDef[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "search",
    label: "Search",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "kits",
    label: "Kits",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M12 4.467c0-.405.262-.75.559-1.027.276-.257.441-.584.441-.94 0-.828-.895-1.5-2-1.5s-2 .672-2 1.5c0 .362.171.694.456.953.29.265.544.6.544.994a.968.968 0 01-1.024.974 39.655 39.655 0 01-3.014-.306.75.75 0 00-.847.847c.14.993.242 1.999.306 3.014A.968.968 0 014.447 10c-.393 0-.729-.253-.994-.544C3.194 9.17 2.862 9 2.5 9 1.672 9 1 9.895 1 11s.672 2 1.5 2c.356 0 .683-.165.953-.456.265-.29.6-.544.994-.544a.968.968 0 01.974 1.024c-.064 1.015-.166 2.021-.306 3.014a.75.75 0 00.847.847 39.655 39.655 0 013.014-.306A.968.968 0 0110 15.553c0-.393-.253-.729-.544-.994C9.17 14.306 9 13.862 9 13.5c0-.828.895-1.5 2-1.5s2 .672 2 1.5c0 .362-.171.694-.456.953-.29.265-.544.6-.544.994a.968.968 0 001.024.974 39.655 39.655 0 003.014-.306.75.75 0 00.847-.847 39.655 39.655 0 01-.306-3.014A.968.968 0 0115.553 10c.393 0 .729.253.994.544.27.276.597.456.953.456.828 0 1.5-.895 1.5-2s-.672-2-1.5-2c-.362 0-.694.171-.953.456-.265.29-.6.544-.994.544a.968.968 0 01-.974-1.024c.064-1.015.166-2.021.306-3.014a.75.75 0 00-.847-.847 39.655 39.655 0 01-3.014.306A.968.968 0 0112 4.467z" />
      </svg>
    ),
  },
];

export default function Settings() {
  const [activePage, setActivePage] = useState<SettingsPage>("general");
  const { config, isLoading, update, resetSection } = useConfig();

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
            <span className={styles.navIcon}>{page.icon}</span>
            {page.label}
          </button>
        ))}
        <div className={styles.version}>v0.1.0</div>
      </nav>
      <main className={styles.content}>
        {activePage === "general" && (
          <GeneralSettings config={config} onUpdate={update} onResetSection={resetSection} />
        )}
        {activePage === "search" && (
          <SearchSettings config={config} onUpdate={update} onResetSection={resetSection} />
        )}
        {activePage === "chat" && (
          <ChatSettings config={config} onUpdate={update} onResetSection={resetSection} />
        )}
        {activePage === "kits" && <KitsSettings config={config} onUpdate={update} />}
      </main>
    </div>
  );
}
