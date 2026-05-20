import { Tray, Menu, nativeImage, app } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { join } from "path";
import { showOverlay } from "./overlay";
import { selectDisplayMeeting, formatMenubarText } from "../lib/menubar-format";
import { getPrepStatus } from "../heartbeat/prep-cache";
import type { Meeting, FlintConfig } from "../types";

let tray: Tray | null = null;

const MAX_MENU_ITEMS = 10;
const MAX_SUBJECT_LENGTH = 40;
const MAX_BADGE_COUNT = 9;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Strip control characters and zero-width chars from a string. */
function sanitizeSubject(subject: string): string {
  // Strip control chars (\x00-\x1F, \x7F) and zero-width chars (U+200B-U+200F, U+FEFF)
  // eslint-disable-next-line no-control-regex -- intentionally matching control characters
  const stripped = subject.replace(/[\x00-\x1F\x7F\u200B-\u200F\uFEFF]/g, "");
  // Escape `&` — macOS menus interpret it as an accelerator prefix
  return stripped.replace(/&/g, "&&");
}

/** Truncate to maxLen with ellipsis if needed. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

/** Get midnight (end of day) in local timezone for a given timestamp. */
function endOfLocalDay(timestampMs: number): number {
  const d = new Date(timestampMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export interface TrayMenuOptions {
  onMeetingFocus: (meeting: Meeting) => void;
  onShowOverlay: () => void;
  onShowSettings: () => void;
  showAllDay?: boolean;
  now?: () => number;
}

/** Is this meeting still upcoming or in-progress? */
function isUpcoming(m: Meeting, nowMs: number): boolean {
  if (m.isAllDay) {
    // All-day events visible until midnight of the event's day
    return endOfLocalDay(new Date(m.startTime).getTime()) >= nowMs;
  }
  const end = new Date(m.endTime).getTime();
  return !Number.isNaN(end) && end > nowMs;
}

/** Count meetings that are still upcoming or in-progress. */
export function countUpcomingMeetings(meetings: Meeting[], now?: () => number): number {
  const nowMs = (now ?? Date.now)();
  return meetings.filter((m) => isUpcoming(m, nowMs)).length;
}

/**
 * Pure function: builds the tray context menu template from meetings.
 * Filters out past meetings, sorts all-day first then by start time,
 * caps at MAX_MENU_ITEMS, and appends Show Flint / Quit.
 */
export function buildTrayMenuTemplate(
  meetings: Meeting[],
  options: TrayMenuOptions,
): MenuItemConstructorOptions[] {
  const nowMs = (options.now ?? Date.now)();
  const template: MenuItemConstructorOptions[] = [];

  // Filter to upcoming/in-progress meetings, split by type
  const upcoming = meetings.filter((m) => isUpcoming(m, nowMs));
  const allDay = upcoming.filter((m) => m.isAllDay);
  const timed = upcoming.filter((m) => !m.isAllDay);

  // Sort timed by start time
  timed.sort((a, b) => {
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  // All-day section (if enabled and present)
  const showingAllDay = options.showAllDay !== false && allDay.length > 0;
  if (showingAllDay) {
    template.push({ label: "All day", enabled: false });
    for (const meeting of allDay) {
      const sanitized = sanitizeSubject(meeting.title);
      const subject = truncate(sanitized, MAX_SUBJECT_LENGTH);
      template.push({
        label: `    ${subject}`,
        enabled: false,
      });
    }
    if (timed.length > 0) {
      template.push({ type: "separator" });
    }
  }

  // Timed meetings
  const overflow = timed.length > MAX_MENU_ITEMS ? timed.length - MAX_MENU_ITEMS : 0;
  const visible = overflow > 0 ? timed.slice(0, MAX_MENU_ITEMS) : timed;

  if (visible.length === 0 && !showingAllDay) {
    template.push({ label: "No more meetings today", enabled: false });
  } else {
    for (const meeting of visible) {
      const sanitized = sanitizeSubject(meeting.title);
      const subject = truncate(sanitized, MAX_SUBJECT_LENGTH);
      const timeLabel = timeFormatter.format(new Date(meeting.startTime));
      const prepStatus = getPrepStatus(meeting.id);
      // Subtle prep indicator: ● prepped with notes, ○ prepped/nothing found, no dot = pending
      const dot = prepStatus === "ready" ? "\u25CF " : prepStatus === "empty" ? "\u25CB " : "  ";
      // LTR mark keeps time on the left when subject is RTL (e.g. Hebrew)
      const label = `\u200E${dot}${timeLabel}  ${subject}`;

      template.push({
        label,
        click: () => {
          options.onMeetingFocus(meeting);
        },
      });
    }

    if (overflow > 0) {
      template.push({ label: `+${String(overflow)} more`, enabled: false });
    }
  }

  template.push({ type: "separator" });
  template.push({
    label: "Show Flint",
    click: () => {
      options.onShowOverlay();
    },
  });
  template.push({
    label: "Settings\u2026",
    click: () => {
      options.onShowSettings();
    },
  });
  template.push({ type: "separator" });
  template.push({
    label: "Quit",
    click: () => {
      app.quit();
    },
  });

  return template;
}

export function createTray(options?: { onShowSettings?: () => void }): Tray {
  const iconPath = join(__dirname, "../../resources/trayTemplate.png");
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Flint");

  // Initial menu with no meetings
  const contextMenu = Menu.buildFromTemplate(
    buildTrayMenuTemplate([], {
      onMeetingFocus: () => undefined,
      onShowOverlay: showOverlay,
      onShowSettings: options?.onShowSettings ?? (() => undefined),
    }),
  );
  tray.setContextMenu(contextMenu);

  return tray;
}

export function getTray(): Tray | null {
  return tray;
}

export function updateTrayMeetings(
  meetings: Meeting[],
  options: {
    onMeetingFocus: (meeting: Meeting) => void;
    onShowSettings: () => void;
    showAllDay: boolean;
  },
): void {
  if (!tray) return;
  const template = buildTrayMenuTemplate(meetings, {
    onMeetingFocus: options.onMeetingFocus,
    onShowOverlay: showOverlay,
    onShowSettings: options.onShowSettings,
    showAllDay: options.showAllDay,
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

export function updateTrayBadge(count: number): void {
  if (!tray) return;
  if (count > MAX_BADGE_COUNT) {
    tray.setTitle(`${String(MAX_BADGE_COUNT)}+`);
  } else {
    tray.setTitle(count > 0 ? String(count) : "");
  }
}

export function updateTrayTitle(
  meetings: Meeting[],
  config: FlintConfig,
  now?: () => number,
): void {
  if (!tray) return;
  if (!config.menubarEnabled) {
    tray.setTitle("");
    return;
  }
  const nowMs = (now ?? Date.now)();
  const display = selectDisplayMeeting(meetings, nowMs);
  const text = formatMenubarText(display, config.menubarTime, config.menubarTitle, nowMs);
  tray.setTitle(text);
}
