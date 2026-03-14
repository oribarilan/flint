import { useAppIcon } from "../hooks/useAppIcon";
import styles from "./KindIcon.module.css";

interface IconData {
  d: string;
  fillRule?: "evenodd";
  clipRule?: "evenodd";
}

const FILE_ICON: IconData = {
  d: "M3 3.5A1.5 1.5 0 014.5 2h6.879a1.5 1.5 0 011.06.44l3.122 3.12a1.5 1.5 0 01.439 1.061V16.5A1.5 1.5 0 0114.5 18h-10A1.5 1.5 0 013 16.5v-13z",
};

const ICON_PATHS: Record<string, IconData> = {
  directory: {
    d: "M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z",
  },
  application: {
    d: "M3.25 3A2.25 2.25 0 001 5.25v9.5A2.25 2.25 0 003.25 17h13.5A2.25 2.25 0 0019 14.75v-7.5A2.25 2.25 0 0016.75 5H10.5l-1.72-1.72A2.25 2.25 0 007.2 2.5H3.25zM10 10a1 1 0 011-1h.01a1 1 0 110 2H11a1 1 0 01-1-1zm-4 0a1 1 0 011-1h.01a1 1 0 110 2H7a1 1 0 01-1-1z",
    fillRule: "evenodd",
    clipRule: "evenodd",
  },
  file: FILE_ICON,
};

interface KindIconProps {
  kind: "file" | "directory" | "application";
  path: string;
  selected?: boolean;
}

export default function KindIcon({ kind, path, selected }: KindIconProps) {
  const appIcon = useAppIcon(path, kind);

  if (kind === "application" && appIcon) {
    return <img className={styles.appIcon} src={appIcon} alt="" aria-hidden="true" />;
  }

  const iconData = ICON_PATHS[kind] ?? FILE_ICON;

  return (
    <div className={selected ? styles.iconContainerSelected : styles.iconContainer}>
      <svg
        className={selected ? styles.kindIconSelected : styles.kindIcon}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d={iconData.d} fillRule={iconData.fillRule} clipRule={iconData.clipRule} />
      </svg>
    </div>
  );
}
